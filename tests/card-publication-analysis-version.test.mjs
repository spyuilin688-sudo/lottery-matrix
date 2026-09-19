import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Use the producer's version so a future worker upgrade cannot silently leave
// the database publication gate behind again.
const worker = readFileSync(new URL('../services/matrix-api/app/worker.py', import.meta.url), 'utf8');
const version = worker.match(/^ANALYSIS_VERSION = "([^"]+)"$/m)[1];
const token = '00000000-0000-0000-0000-000000000001';
const digest = 'a'.repeat(64);

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema private; create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]);
    create table public.lottery_draws (
      id bigint generated always as identity primary key, lottery text not null,
      period text not null, draw_date date, numbers jsonb not null, sorted_numbers jsonb not null,
      draw_order_numbers jsonb, source_id text, created_at timestamptz default now(),
      updated_at timestamptz default now(), unique(lottery, period));
    create table public.matrix_analysis_runs (
      lottery text, draw_period text, analysis_version text, status text,
      completed_at timestamptz, primary key(lottery, draw_period, analysis_version));
  `);
  for (const name of [
    '20260905122413_create_static_matrix_card_publication.sql',
    '20260912164917_two_stage_lottery_results.sql',
    '20260912164926_two_stage_card_publication.sql',
    '20260912202511_independent_card_order_publication.sql',
    '20260914143243_raw_card_requires_completed_analysis.sql',
    '20260919172621_align_card_publication_v15.sql',
  ]) await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  return db;
}

async function prepare(db, lottery) {
  const numbers = ['今彩539', '天天樂'].includes(lottery)
    ? ['01', '02', '03', '04', '05'] : ['01', '02', '03', '04', '05', '06', '07'];
  await db.query(`insert into lottery_draws
    (lottery,period,draw_date,numbers,sorted_numbers,draw_order_numbers,result_status)
    values ($1,'00100','2026-09-19',$2,$2,$2,'confirmed')`, [lottery, JSON.stringify(numbers)]);
  await db.query('select public.claim_matrix_card_publication_v2($1,$2::uuid)', [lottery, token]);
  await db.query('select public.observe_matrix_card_snapshot($1,$2::uuid,$3,$4)', [lottery, token, digest, '00100']);
  const code = { 今彩539: '539', 天天樂: 'fantasy5', 六合彩: 'marksix', 大樂透: 'lotto649' }[lottery];
  return { lottery, period: '00100', generation: digest, cards: Object.fromEntries(['sorted', 'draw'].map(order => [order, {
    url: `https://project.supabase.co/storage/v1/object/public/matrix-card-png/${code}/00100/${digest}/${order}.png`,
    mimeType: 'image/png', width: 2276, height: 3438, sha256: 'b'.repeat(64), inputDigest: digest,
  }])) };
}

async function publish(db, payload, owner = token) {
  return (await db.query('select public.publish_matrix_card($1,$2::uuid,$3,$4::jsonb) ok',
    [payload.lottery, owner, payload.generation, JSON.stringify(payload)])).rows[0].ok;
}

async function analysis(db, lottery, { period = '00100', analysisVersion = `${period}:${version}-draw`, status = 'complete', completed = true } = {}) {
  await db.exec('delete from matrix_analysis_runs');
  await db.query(`insert into matrix_analysis_runs values ($1,$2,$3,$4,$5)`,
    [lottery, period, analysisVersion, status, completed ? '2026-09-19T12:00:00Z' : null]);
}

for (const lottery of ['今彩539', '六合彩', '大樂透']) {
  test(`${lottery}: completed current worker analysis allows adding the actual card to the sorted publication`, async () => {
    const db = await database();
    try {
      const payload = await prepare(db, lottery);
      const sorted = { ...payload, cards: { sorted: payload.cards.sorted } };
      assert.equal(await publish(db, sorted), true);
      assert.equal(await publish(db, payload), false);
      await analysis(db, lottery);
      assert.equal(await publish(db, payload), true);
      assert.deepEqual((await db.query('select manifest from matrix_card_publications')).rows[0].manifest, payload);
    } finally { await db.close(); }
  });
}

test('old, incomplete, wrong-order, wrong-period and wrong-lottery analyses cannot unlock actual cards', async () => {
  const db = await database();
  try {
    const payload = await prepare(db, '今彩539');
    for (const options of [
      { analysisVersion: '00100:matrix-python-v14-draw' },
      { status: 'running', completed: false },
      { status: 'failed' },
      { completed: false },
      { analysisVersion: `00100:${version}-sorted` },
      { period: '00099' },
    ]) {
      await analysis(db, '今彩539', options);
      assert.equal(await publish(db, payload), false, JSON.stringify(options));
    }
    await analysis(db, '六合彩');
    assert.equal(await publish(db, payload), false);
    await analysis(db, '今彩539');
    assert.equal(await publish(db, payload, '00000000-0000-0000-0000-000000000002'), false);
    assert.equal(await publish(db, payload), true);
    await db.exec(`update matrix_card_publications set lease_until=clock_timestamp()-interval '1 second'`);
    assert.equal(await publish(db, payload), false);
  } finally { await db.close(); }
});

test('天天樂 remains sorted-only and publication permissions remain service-role-only', async () => {
  const db = await database();
  try {
    const payload = await prepare(db, '天天樂');
    await analysis(db, '天天樂');
    assert.equal(await publish(db, payload), false);
    assert.equal(await publish(db, { ...payload, cards: { sorted: payload.cards.sorted } }), true);
    for (const [role, expected] of [['anon', false], ['authenticated', false], ['service_role', true]]) {
      const { rows } = await db.query(`select has_function_privilege($1,'public.publish_matrix_card(text,uuid,text,jsonb)','EXECUTE') allowed`, [role]);
      assert.equal(rows[0].allowed, expected);
    }
  } finally { await db.close(); }
});
