import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = new URL('../supabase/migrations/20260912164926_two_stage_card_publication.sql', import.meta.url);
const initial = new URL('../supabase/migrations/20260905122413_create_static_matrix_card_publication.sql', import.meta.url);
const resultStages = new URL('../supabase/migrations/20260912164917_two_stage_lottery_results.sql', import.meta.url);
const token = '00000000-0000-0000-0000-000000000001';
const nextToken = '00000000-0000-0000-0000-000000000002';
const digest = 'a'.repeat(64);
const numbers = ['01', '07', '11', '20', '39'];

async function database({ lottery = '今彩539', status = 'confirmed', actual } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema private; create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]);
    create table public.lottery_draws (
      id bigint generated always as identity primary key, lottery text not null,
      period text not null, draw_date date, numbers jsonb not null, sorted_numbers jsonb not null,
      draw_order_numbers jsonb, source_id text, created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(), unique(lottery, period));
    create table public.matrix_analysis_runs (
      lottery text, draw_period text, analysis_version text,
      primary key(lottery, draw_period, analysis_version));
  `);
  await db.exec(readFileSync(initial, 'utf8'));
  await db.exec(readFileSync(resultStages, 'utf8'));
  if (existsSync(migration)) await db.exec(readFileSync(migration, 'utf8'));
  const drawNumbers = ['六合彩', '大樂透'].includes(lottery) ? [...numbers, '42', '49'] : numbers;
  await db.query(`insert into public.lottery_draws
      (lottery, period, draw_date, numbers, sorted_numbers, draw_order_numbers, result_status)
    values ($1, '00100', '2026-09-12', $2, $2, $3, $4)`,
    [lottery, JSON.stringify(drawNumbers), actual === null ? null : JSON.stringify(actual ?? drawNumbers), status]);
  return db;
}

function manifest({ lottery = '今彩539', period = '00100', generation = digest, orders = ['draw', 'sorted'] } = {}) {
  const code = { 今彩539: '539', 天天樂: 'fantasy5', 六合彩: 'marksix', 大樂透: 'lotto649' }[lottery];
  return {
    lottery, period, generation, generatedAt: '2026-09-12T12:00:00+00:00',
    cards: Object.fromEntries(orders.map(order => [order, {
      url: `https://project.supabase.co/storage/v1/object/public/matrix-card-png/${code}/${period}/${generation}/${order}.png`,
      mimeType: 'image/png', width: 2276, height: 3438, sha256: 'b'.repeat(64),
    }])),
  };
}

async function observe(db, { lottery = '今彩539', owner = token, generation = digest, period = '00100' } = {}) {
  await db.query('select public.claim_matrix_card_publication($1, $2::uuid)', [lottery, owner]);
  const result = await db.query('select public.observe_matrix_card_snapshot($1, $2::uuid, $3, $4) ready',
    [lottery, owner, generation, period]);
  assert.equal(result.rows[0].ready, true);
}

async function publish(db, payload = manifest(), owner = token, generation = payload.generation) {
  return (await db.query('select public.publish_matrix_card($1, $2::uuid, $3, $4::jsonb) published',
    [payload.lottery, owner, generation, JSON.stringify(payload)])).rows[0].published;
}

test('preliminary sorted card is eligible and published immediately after observation', async () => {
  const db = await database({ status: 'preliminary', actual: null });
  try {
    await observe(db);
    assert.equal((await db.query(`select eligible_at <= clock_timestamp() ready from matrix_card_publications`)).rows[0].ready, true);
    const sorted = manifest({ orders: ['sorted'] });
    assert.equal(await publish(db, sorted), true);
    assert.deepEqual((await db.query('select manifest from matrix_card_publications')).rows[0].manifest, sorted);
  } finally { await db.close(); }
});

for (const [name, input] of [
  ['preliminary status even if actual numbers are present', { status: 'preliminary' }],
  ['missing actual numbers', { actual: null }],
  ['empty actual numbers', { actual: [] }],
  ['incomplete actual numbers', { actual: ['01'] }],
  ['sorted-only official lottery', { lottery: '天天樂' }],
]) {
  test(`actual card cannot publish with ${name}`, async () => {
    const db = await database(input);
    try {
      const lottery = input.lottery ?? '今彩539';
      await observe(db, { lottery });
      // Remove only the old time gate to isolate source-readiness validation.
      await db.exec(`update matrix_card_publications set eligible_at = clock_timestamp() - interval '1 second'`);
      assert.equal(await publish(db, manifest({ lottery })), false);
      assert.equal((await db.query('select manifest from matrix_card_publications')).rows[0].manifest, null);
    } finally { await db.close(); }
  });
}

test('confirmation fences the preliminary lease and allows a complete new generation', async () => {
  const db = await database({ status: 'preliminary', actual: null });
  try {
    await observe(db);
    assert.equal(await publish(db, manifest({ orders: ['sorted'] })), true);
    await db.query(`update lottery_draws set result_status='confirmed', draw_order_numbers=$1`,
      [JSON.stringify(['39', '20', '11', '07', '01'])]);
    assert.equal(await publish(db), false);
    const generation = 'c'.repeat(64);
    await observe(db, { owner: nextToken, generation });
    const complete = manifest({ generation });
    assert.equal(await publish(db, complete, nextToken), true);
    const stored = (await db.query('select manifest, published_at is not null dated from matrix_card_publications')).rows[0];
    assert.deepEqual(stored.manifest, complete);
    assert.equal(stored.dated, true);
  } finally { await db.close(); }
});

for (const lottery of ['今彩539', '天天樂', '六合彩', '大樂透']) {
  test(`complete official ${lottery} manifest publishes in supported orders`, async () => {
    const db = await database({ lottery });
    try {
      await observe(db, { lottery });
      const payload = manifest({ lottery, orders: lottery === '天天樂' ? ['sorted'] : ['draw', 'sorted'] });
      assert.equal(await publish(db, payload), true);
      assert.deepEqual((await db.query('select manifest from matrix_card_publications')).rows[0].manifest, payload);
    } finally { await db.close(); }
  });
}

test('stale token, digest, desired period, expired lease and latest period cannot publish', async () => {
  const db = await database();
  try {
    await observe(db);
    await db.exec(`update matrix_card_publications set eligible_at = clock_timestamp() - interval '1 second'`);
    assert.equal(await publish(db, manifest(), nextToken), false);
    assert.equal(await publish(db, manifest({ generation: 'c'.repeat(64) })), false);
    assert.equal(await publish(db, manifest({ period: '00099' })), false);
    await db.exec(`update matrix_card_publications set lease_until = clock_timestamp() - interval '1 second'`);
    assert.equal(await publish(db), false);
    await db.query(`insert into lottery_draws(lottery,period,draw_date,numbers,sorted_numbers,draw_order_numbers)
      values('今彩539','00101','2026-09-13',$1,$1,$1)`, [JSON.stringify(numbers)]);
    await observe(db, { owner: nextToken });
    await db.exec(`update matrix_card_publications set eligible_at = clock_timestamp() - interval '1 second'`);
    assert.equal(await publish(db, manifest(), nextToken), false);
  } finally { await db.close(); }
});

test('correction to a historical row fences a rendered snapshot before publication', async () => {
  const db = await database();
  try {
    await db.query(`insert into lottery_draws(lottery,period,draw_date,numbers,sorted_numbers,draw_order_numbers)
      values('今彩539','00099','2026-09-11',$1,$1,$1)`, [JSON.stringify(numbers)]);
    await observe(db);
    await db.query(`update lottery_draws set draw_order_numbers=$1 where period='00099'`,
      [JSON.stringify(['39', '20', '11', '07', '01'])]);
    assert.equal(await publish(db), false);
  } finally { await db.close(); }
});

test('invalid PNG metadata, unexpected orders and nonimmutable URLs are rejected', async () => {
  const db = await database();
  try {
    await observe(db);
    const mutations = [
      card => { card.cards.sorted.mimeType = 'image/svg+xml'; },
      card => { card.cards.sorted.width = '2276'; },
      card => { card.cards.sorted.height = 123; },
      card => { card.cards.sorted.sha256 = 'invalid'; },
      card => { card.cards.sorted.url = card.cards.sorted.url.replace(digest, 'c'.repeat(64)); },
      card => { card.cards.sorted.url += '?version=1'; },
      card => { card.cards.sorted.url = card.cards.sorted.url.replace('https://', 'http://'); },
      card => { card.cards.sorted.url = card.cards.sorted.url.replace('/storage/', '/other/storage/'); },
      card => { card.cards.draw.url = card.cards.draw.url.replace('project.supabase.co', 'different.supabase.co'); },
      card => { card.cards.extra = card.cards.sorted; },
      card => { delete card.cards.sorted; },
      card => { card.cards.sorted = null; },
      card => { card.cards = []; },
      card => { card.period = null; },
    ];
    for (const mutate of mutations) {
      const invalid = manifest();
      mutate(invalid);
      await assert.rejects(publish(db, invalid), /CARD_MANIFEST_INVALID/);
    }
    assert.equal((await db.query('select manifest from matrix_card_publications')).rows[0].manifest, null);
  } finally { await db.close(); }
});

test('publication RPC permissions remain limited to service role', async () => {
  const db = await database();
  try {
    for (const signature of [
      'public.observe_matrix_card_snapshot(text,uuid,text,text)',
      'public.publish_matrix_card(text,uuid,text,jsonb)',
    ]) {
      for (const [role, allowed] of [['anon', false], ['authenticated', false], ['service_role', true]]) {
        const { rows } = await db.query(`select has_function_privilege($1, $2, 'EXECUTE') allowed`, [role, signature]);
        assert.equal(rows[0].allowed, allowed);
      }
    }
  } finally { await db.close(); }
});
