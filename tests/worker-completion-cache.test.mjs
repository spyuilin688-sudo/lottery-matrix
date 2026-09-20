import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const path = new URL('../supabase/migrations/20260920193052_worker_completion_cache.sql', import.meta.url);
const tables = ['matrix_analysis_artifacts', 'matrix_analysis_artifact_chunks',
  'matrix_explore_results', 'matrix_tianheng_results', 'matrix_tianshu_results'];
async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private;
    create table lottery_draws(lottery text, period text, draw_date date,
      result_status text, numbers jsonb, primary key(lottery,period));
    create table matrix_analysis_runs(lottery text, draw_period text, analysis_version text, status text);
    create table matrix_card_publications(lottery text primary key, manifest jsonb);
    create table notification_events(event_key text, event_type text, payload jsonb, fanout_status text);`);
  for (const table of tables) await db.exec(`create table ${table} (
    lottery text, draw_period text, analysis_version text, expires_at timestamptz);`);
  if (existsSync(path)) await db.exec(readFileSync(path, 'utf8'));
  await db.exec(`insert into lottery_draws values ('天天樂','11988','2026-09-20','confirmed','[1,2,3,4,5]');
    insert into matrix_analysis_artifacts values ('天天樂','11988','11988:v15-sorted',now()+interval '1 day');`);
  return db;
}
async function snapshot(db, version = 'v15', notifications = true) {
  return (await db.query('select matrix_worker_completion_snapshot($1,$2,$3) state', ['天天樂', version, notifications])).rows[0].state;
}
async function certify(db, generation, notifications = true) {
  return (await db.query('select matrix_worker_completion_certify($1,$2,$3,$4,$5) ready',
    ['天天樂', '11988', 'v15', notifications, generation])).rows[0].ready;
}

test('completion marker is version and notification scoped and reuses an atomic draw snapshot', async () => {
  const db = await database();
  try {
    const initial = await snapshot(db);
    assert.equal(initial.ready, false);
    assert.equal(initial.draw.period, '11988');
    assert.equal(await certify(db, initial.generation, false), true);
    assert.equal((await snapshot(db, 'v15', false)).ready, true);
    assert.equal((await snapshot(db)).ready, false);
    assert.equal(await certify(db, initial.generation), true);
    assert.equal((await snapshot(db)).ready, true);
    assert.equal((await snapshot(db, 'v16')).ready, false);
  } finally { await db.close(); }
});

test('every readiness dependency invalidates the marker and fences stale certification', async () => {
  const db = await database();
  try {
    const mutations = [
      `update lottery_draws set numbers='[2,3,4,5,6]'`,
      `insert into matrix_analysis_runs values ('天天樂','11988','11988:v15-sorted','running')`,
      ...tables.map(table => `insert into ${table} values ('天天樂','11988','11988:v15-sorted',now()+interval '1 day')`),
      `insert into matrix_card_publications values ('天天樂','{}')`,
      `insert into notification_events values ('result','lottery_result','{"lottery":"天天樂"}','pending')`,
      `delete from matrix_tianshu_results`,
      `truncate matrix_explore_results`,
    ];
    for (const sql of mutations) {
      const before = await snapshot(db);
      assert.equal(await certify(db, before.generation), true, sql);
      await db.exec(sql);
      const after = await snapshot(db);
      assert.equal(after.ready, false, sql);
      assert.ok(after.generation > before.generation, sql);
      assert.equal(await certify(db, before.generation), false, sql);
    }
  } finally { await db.close(); }
});

test('bulk mutations increment one generation per lottery and rollback restores readiness', async () => {
  const db = await database();
  try {
    const before = await snapshot(db);
    await certify(db, before.generation);
    await db.exec(`begin; insert into matrix_tianheng_results
      select '天天樂','11988','11988:v15-sorted',now()+interval '1 day' from generate_series(1,1000);`);
    assert.equal((await snapshot(db)).generation, before.generation + 1);
    await db.exec('rollback');
    assert.equal((await snapshot(db)).ready, true);
  } finally { await db.close(); }
});

test('new period, preliminary draw and expired evidence cannot retain ready state', async () => {
  const db = await database();
  try {
    let before = await snapshot(db);
    await certify(db, before.generation);
    await db.exec(`insert into lottery_draws values ('天天樂','11989','2026-09-21','preliminary','[1,2,3,4,5]')`);
    assert.equal((await snapshot(db)).ready, false);
    assert.equal((await snapshot(db)).draw.period, '11989');
    await db.exec(`delete from lottery_draws where period='11989';
      update matrix_analysis_artifacts set expires_at=now()-interval '1 second';`);
    before = await snapshot(db);
    assert.equal(await certify(db, before.generation), false);
    assert.equal((await snapshot(db)).ready, false);
  } finally { await db.close(); }
});

test('snapshot uses indexed latest draw access and expiration without mutations', async () => {
  const db = await database();
  try {
    await certify(db, (await snapshot(db)).generation);
    await db.exec(`update private.matrix_worker_completion set valid_until=now()-interval '1 second'`);
    assert.equal((await snapshot(db)).ready, false);
    await db.exec('set enable_seqscan=off');
    const plan = (await db.query(`explain select * from lottery_draws where lottery='天天樂'
      order by draw_date desc nulls last, period desc limit 1`)).rows.map(row => row['QUERY PLAN']).join('\n');
    assert.doesNotMatch(plan, /Sort/);
    assert.match(plan, /lottery_draws_worker_latest_idx/);
  } finally { await db.close(); }
});

test('completion RPCs are restricted to service_role', async () => {
  const db = await database();
  try {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(snapshot(db), /permission denied/);
      await assert.rejects(certify(db, 0), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    assert.equal((await snapshot(db)).ready, false);
  } finally { await db.close(); }
});

test('draw read cache and worker completion triggers invalidate together on aliases and corrections', async () => {
  const db = await database();
  try {
    await db.exec(`alter table lottery_draws add column sorted_numbers jsonb;
      alter table lottery_draws add column draw_order_numbers jsonb;
      alter table lottery_draws add column updated_at timestamptz default now();`);
    for (const name of ['20260914114420_matrix_draw_query_pagination.sql',
      '20260917002000_optimize_matrix_draw_query_read_path.sql',
      '20260920192323_matrix_draw_indexed_read_cache.sql']) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }
    await db.exec(`insert into lottery_draws(lottery,period,draw_date,result_status,numbers)
      values ('今彩539','99000001','2026-09-20','confirmed','[1,2,3,4,5]');
      insert into matrix_analysis_artifacts values ('今彩539','99000001','99000001:v15-sorted',now()+interval '1 day');`);
    const probe = async () => (await db.query(`select matrix_worker_completion_snapshot('今彩539','v15',false) state,
      (select revision from private.matrix_draw_read_state where lottery='今彩539') revision`)).rows[0];
    const mutations = [
      `insert into lottery_draws(lottery,period,draw_date,result_status,numbers) values ('今彩539','099000001','2026-09-20','confirmed','[1,2,3,4,5]')`,
      `update lottery_draws set numbers='[2,3,4,5,6]' where lottery='今彩539' and period='099000001'`,
      `delete from lottery_draws where lottery='今彩539' and period='099000001'`,
    ];
    for (const mutation of mutations) {
      const before = await probe();
      assert.equal((await db.query(`select matrix_worker_completion_certify('今彩539','99000001','v15',false,$1) ready`,
        [before.state.generation])).rows[0].ready, true);
      await db.exec('begin');
      await db.exec(mutation);
      const after = await probe();
      assert.notEqual(after.revision, before.revision);
      assert.ok(after.state.generation > before.state.generation);
      assert.equal(after.state.ready, false);
      await db.exec('commit');
    }
  } finally { await db.close(); }
});
