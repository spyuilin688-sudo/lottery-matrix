import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migrations = join(import.meta.dirname, '../../../supabase/migrations');
const migrationPath = join(migrations, '20260923233000_retry_late_card_invalidation.sql');
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

function definition(source, functionName) {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`create(?: or replace)? function ${escaped}\\([^]*?\\$\\$;`, 'i'));
  assert.ok(match, `${functionName} must be defined`);
  return match[0];
}

async function makeDb({ fullMigration = false } = {}) {
  const db = new PGlite();
  await db.exec(`
    create schema private;
    create schema vault;
    create schema net;
    create schema cron;
    create role anon;
    create role authenticated;
    create role service_role;
    create table cron.job(jobid bigint primary key,jobname text,schedule text,command text);
    insert into cron.job values
      (9,'matrix-analysis-retention','17 * * * *','select private.matrix_analysis_cleanup_tick();'),
      (10,'unrelated-job','0 0 * * *','select 1;');
    create function cron.unschedule(p_jobid bigint) returns boolean language plpgsql as $$begin
      delete from cron.job where jobid=p_jobid;
      return found;
    end$$;
    create function cron.schedule(p_name text,p_schedule text,p_command text) returns bigint
    language plpgsql as $$begin
      insert into cron.job values(11,p_name,p_schedule,p_command);
      return 11;
    end$$;
    create table public.lottery_draws(lottery text, period text, draw_date date, result_status text);
    create table public.matrix_card_publications(lottery text primary key, card_ready boolean not null,
      analysis_ready boolean not null default true, matrix_ready boolean not null default true);
    create table private.matrix_primary_schedule(worker_group text primary key, cycle_date date, completed_at timestamptz);
    create table private.matrix_recovery_schedule(
      lottery text primary key, worker_group text, cycle_date date,
      completed_at timestamptz, dispatched_at timestamptz, next_at timestamptz,
      skip_reason text, last_error text
    );
    create table private.test_cleanup(count integer not null);
    insert into private.test_cleanup values(0);
    create table private.test_http(url text, headers jsonb);
    create table vault.decrypted_secrets(name text, decrypted_secret text);
    insert into vault.decrypted_secrets values
      ('matrix_project_url','https://project.test'),
      ('matrix_admin_watchdog_token','test-token');
    create function private.matrix_card_publication_complete(p_lottery text,p_period text)
    returns boolean language sql stable as $$
      select coalesce((select card_ready from public.matrix_card_publications where lottery=p_lottery),false)
    $$;
    create function public.matrix_watchdog_chain_state(p_lottery text,p_period text)
    returns jsonb language sql stable as $$
      select jsonb_build_object('latestPeriod',(select period from public.lottery_draws where lottery=p_lottery
        order by draw_date desc nulls last,period desc limit 1),
        'analysisComplete',(select analysis_ready from public.matrix_card_publications where lottery=p_lottery),
        'matrixStatusComplete',(select matrix_ready from public.matrix_card_publications where lottery=p_lottery),
        'cardComplete',private.matrix_card_publication_complete(p_lottery,p_period))
    $$;
    create function private.matrix_recovery_replan(p_group text)
    returns void language sql as $$select null::void$$;
    create function private.matrix_analysis_cleanup_tick()
    returns integer language plpgsql as $$begin
      update private.test_cleanup set count=count+1;
      return 1;
    end$$;
    create function net.http_post(
      url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
      headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 2000
    ) returns bigint language plpgsql as $$begin
      insert into private.test_http values(url,headers);
      return 123;
    end$$;
  `);
  const slots = readFileSync(join(migrations, '20260920233444_recovery_dynamic_slots.sql'), 'utf8');
  await db.exec(definition(slots, 'private.matrix_recovery_slots'));
  if (fullMigration) {
    await db.exec(sql);
    return db;
  }
  for (const name of [
    'private.matrix_late_correction_candidates',
    'private.matrix_late_correction_tick',
    'private.matrix_retention_with_correction_tick',
    'public.matrix_recovery_pending',
    'public.matrix_recovery_complete',
  ]) await db.exec(definition(sql, name));
  return db;
}

async function current(db, { completed = false, ready = false, lottery = '今彩539', group = 'evening' } = {}) {
  await db.query(`insert into public.lottery_draws values($1,'115000231','2026-09-21','confirmed')`, [lottery]);
  await db.query(`insert into public.matrix_card_publications values($1,$2)`, [lottery, ready]);
  await db.query(`insert into private.matrix_primary_schedule values($1,'2026-09-21',$2)`, [
    group, completed ? '2026-09-21T14:00:00Z' : null,
  ]);
  await db.query(`insert into private.matrix_recovery_schedule(lottery,worker_group,cycle_date,completed_at)
    values($1,$2,'2026-09-21',$3)`, [lottery, group, completed ? '2026-09-21T14:00:00Z' : null]);
}

test('a completed cycle with a corrected card becomes pending before its final recovery slot', async () => {
  const db = await makeDb();
  try {
    await current(db, { completed: true });
    const at = '2026-09-21T14:01:00Z';
    const pending = await db.query(`select public.matrix_recovery_pending($1::timestamptz) as value`, [at]);
    assert.deepEqual(pending.rows[0].value, [{ lottery: '今彩539', cycleDate: '2026-09-21' }]);
    const done = await db.query(`select public.matrix_recovery_complete('今彩539','115000231') as value`);
    assert.equal(done.rows[0].value, false);
    const row = await db.query(`select completed_at from private.matrix_recovery_schedule where lottery='今彩539'`);
    assert.ok(row.rows[0].completed_at);
  } finally { await db.close(); }
});

test('a later no-draw cycle does not erase an older latest draw correction after recovery ends', async () => {
  const db = await makeDb();
  try {
    await current(db);
    await db.exec(`update private.matrix_primary_schedule set cycle_date='2026-09-22',completed_at=null;
      update private.matrix_recovery_schedule set cycle_date='2026-09-22',completed_at=null;`);
    const justBefore = await db.query(`select * from private.matrix_late_correction_candidates('2026-09-22T09:59:59Z')`);
    assert.equal(justBefore.rows.length, 0);
    const after = await db.query(`select * from private.matrix_late_correction_candidates('2026-09-22T10:00:01Z')`);
    assert.deepEqual(after.rows.map(row => [row.lottery, row.cycle_date.toISOString().slice(0, 10)]),
      [['今彩539', '2026-09-21']]);
  } finally { await db.close(); }
});

test('Fantasy 5 uses its own final recovery slot at 06:00 Taipei', async () => {
  const db = await makeDb();
  try {
    await current(db, { lottery:'天天樂',group:'fantasy5' });
    const early = await db.query(`select * from private.matrix_late_correction_candidates('2026-09-21T21:59:59Z')`);
    const late = await db.query(`select * from private.matrix_late_correction_candidates('2026-09-21T22:00:01Z')`);
    assert.equal(early.rows.length, 0);
    assert.deepEqual(late.rows.map(row => row.lottery), ['天天樂']);
  } finally { await db.close(); }
});

test('Fantasy 5 analysis remains pending after its sorted card has already republished', async () => {
  const db = await makeDb();
  try {
    await current(db, { lottery:'天天樂',group:'fantasy5',ready:true,completed:true });
    await db.exec(`update public.matrix_card_publications set analysis_ready=false where lottery='天天樂'`);
    const at = '2026-09-21T03:00:00Z';
    const pending = await db.query(`select public.matrix_recovery_pending($1::timestamptz) as value`, [at]);
    assert.deepEqual(pending.rows[0].value, [{ lottery:'天天樂',cycleDate:'2026-09-21' }]);
    const complete = await db.query(`select public.matrix_recovery_complete('天天樂','115000231') as value`);
    assert.equal(complete.rows[0].value, false);
    await db.query(`select private.matrix_retention_with_correction_tick($1::timestamptz)`, [at]);
    const requests = await db.query(`select count(*)::integer as count from private.test_http`);
    assert.equal(requests.rows[0].count, 1);
    await db.exec(`update public.matrix_card_publications set analysis_ready=true where lottery='天天樂'`);
    const recovered = await db.query(`select public.matrix_recovery_pending($1::timestamptz) as value`, [at]);
    assert.deepEqual(recovered.rows[0].value, []);
  } finally { await db.close(); }
});

test('missing Matrix Status remains pending after analysis and cards pass, without duplicate lottery dispatch', async () => {
  const db = await makeDb();
  try {
    await current(db, { completed:true,ready:true });
    await db.exec(`update public.matrix_card_publications set matrix_ready=false;
      update private.matrix_recovery_schedule set completed_at=null,dispatched_at='2026-09-21T14:01:00Z'`);
    const at = '2026-09-21T14:02:00Z';
    const pending = await db.query(`select public.matrix_recovery_pending($1::timestamptz) as value`, [at]);
    assert.deepEqual(pending.rows[0].value, [{ lottery:'今彩539',cycleDate:'2026-09-21' }]);
    await db.query(`select private.matrix_retention_with_correction_tick($1::timestamptz)`, [at]);
    const requests = await db.query(`select count(*)::integer as count from private.test_http`);
    assert.equal(requests.rows[0].count, 0);
    await db.exec(`update private.matrix_recovery_schedule
      set dispatched_at='2026-09-21T13:40:00Z',next_at=null`);
    await db.query(`select private.matrix_retention_with_correction_tick($1::timestamptz)`, [at]);
    const fallback = await db.query(`select count(*)::integer as count from private.test_http`);
    assert.equal(fallback.rows[0].count, 1);
    await db.exec(`update public.matrix_card_publications set matrix_ready=true`);
    const recovered = await db.query(`select public.matrix_recovery_pending($1::timestamptz) as value`, [at]);
    assert.deepEqual(recovered.rows[0].value, []);
    await db.query(`select private.matrix_retention_with_correction_tick($1::timestamptz)`, [at]);
    const after = await db.query(`select count(*)::integer as count from private.test_http`);
    assert.equal(after.rows[0].count, 1);
  } finally { await db.close(); }
});

test('a future recovery slot owns retry without an extra hourly HTTP call', async () => {
  const db = await makeDb();
  try {
    await current(db, { completed:true });
    await db.exec(`update private.matrix_recovery_schedule
      set completed_at=null,next_at='2026-09-21T15:00:00Z' where lottery='今彩539'`);
    const at = '2026-09-21T14:01:00Z';
    const candidates = await db.query(`select * from private.matrix_late_correction_candidates($1::timestamptz)`, [at]);
    assert.deepEqual(candidates.rows, []);
    await db.query(`select private.matrix_retention_with_correction_tick($1::timestamptz)`, [at]);
    const idle = await db.query(`select count(*)::integer as count from private.test_http`);
    assert.equal(idle.rows[0].count, 0);
    await db.exec(`update private.matrix_recovery_schedule
      set next_at='2026-09-22T10:00:00Z' where lottery='今彩539'`);
    const finalSlot = await db.query(`select * from private.matrix_late_correction_candidates($1::timestamptz)`, [at]);
    assert.deepEqual(finalSlot.rows, []);

    await db.exec(`update private.matrix_recovery_schedule
      set dispatched_at='2026-09-21T14:00:00Z' where lottery='今彩539'`);
    const natural = await db.query(`select public.matrix_recovery_pending($1::timestamptz) as value`, [at]);
    assert.deepEqual(natural.rows[0].value, [{ lottery:'今彩539',cycleDate:'2026-09-21' }]);
    await db.query(`select private.matrix_retention_with_correction_tick($1::timestamptz)`, [at]);
    const overlap = await db.query(`select count(*)::integer as count from private.test_http`);
    assert.equal(overlap.rows[0].count, 0);

    await db.exec(`update private.matrix_recovery_schedule
      set next_at=null,dispatched_at='2026-09-21T13:40:00Z' where lottery='今彩539'`);
    const stranded = await db.query(`select public.matrix_recovery_pending($1::timestamptz) as value`, [at]);
    assert.deepEqual(stranded.rows[0].value, [{ lottery:'今彩539',cycleDate:'2026-09-21' }]);
    await db.query(`select private.matrix_retention_with_correction_tick($1::timestamptz)`, [at]);
    const rescued = await db.query(`select count(*)::integer as count from private.test_http`);
    assert.equal(rescued.rows[0].count, 1);

    await db.exec(`update private.matrix_recovery_schedule
      set next_at='2026-09-22T10:00:00Z',dispatched_at='2026-09-22T10:00:00Z'`);
    const afterFinal = '2026-09-22T10:17:00Z';
    const late = await db.query(`select public.matrix_recovery_pending($1::timestamptz) as value`, [afterFinal]);
    assert.deepEqual(late.rows[0].value, [{ lottery:'今彩539',cycleDate:'2026-09-21' }]);
    await db.query(`select private.matrix_retention_with_correction_tick($1::timestamptz)`, [afterFinal]);
    const noFuture = await db.query(`select count(*)::integer as count from private.test_http`);
    assert.equal(noFuture.rows[0].count, 2);
  } finally { await db.close(); }
});

test('today recovery suppresses a duplicate hourly call for yesterday latest correction', async () => {
  const db = await makeDb();
  try {
    await current(db, { completed:true });
    await db.exec(`update private.matrix_primary_schedule set cycle_date='2026-09-22',completed_at=null;
      update private.matrix_recovery_schedule set cycle_date='2026-09-22',completed_at=null,
        next_at='2026-09-22T13:20:00Z',dispatched_at='2026-09-22T13:10:00Z'`);
    const at = '2026-09-22T13:17:00Z';
    const candidates = await db.query(`select * from private.matrix_late_correction_candidates($1::timestamptz)`, [at]);
    assert.deepEqual(candidates.rows, []);
    const pending = await db.query(`select public.matrix_recovery_pending($1::timestamptz) as value`, [at]);
    assert.deepEqual(pending.rows[0].value, [{ lottery:'今彩539',cycleDate:'2026-09-22' }]);
    await db.query(`select private.matrix_retention_with_correction_tick($1::timestamptz)`, [at]);
    const normal = await db.query(`select count(*)::integer as count from private.test_http`);
    assert.equal(normal.rows[0].count, 0);

    // A canonical no-draw decision stops today's recovery, leaving the
    // corrected prior draw as the latest card that still needs attention.
    await db.exec(`update private.matrix_recovery_schedule
      set skip_reason='no-draw',next_at=null,dispatched_at=null`);
    const older = await db.query(`select public.matrix_recovery_pending($1::timestamptz) as value`, [at]);
    assert.deepEqual(older.rows[0].value, [{ lottery:'今彩539',cycleDate:'2026-09-21' }]);
    await db.query(`select private.matrix_retention_with_correction_tick($1::timestamptz)`, [at]);
    const fallback = await db.query(`select count(*)::integer as count from private.test_http`);
    assert.equal(fallback.rows[0].count, 1);
  } finally { await db.close(); }
});

test('a preliminary latest result, a ready card, and a superseded period do not cause duplicate work', async () => {
  const db = await makeDb();
  try {
    await current(db, { completed: true });
    await db.exec(`update public.matrix_card_publications set card_ready=true;
      insert into public.lottery_draws values('今彩539','115000232','2026-09-22','preliminary');`);
    const pending = await db.query(`select public.matrix_recovery_pending('2026-09-22T10:01:00Z') as value`);
    assert.deepEqual(pending.rows[0].value, []);
    await db.exec(`delete from public.lottery_draws where period='115000232';
      update public.matrix_card_publications set card_ready=false;
      update private.matrix_recovery_schedule set completed_at=null,dispatched_at='2026-09-21T14:01:00Z';`);
    const combined = await db.query(`select public.matrix_recovery_pending('2026-09-21T14:02:00Z') as value`);
    assert.deepEqual(combined.rows[0].value, [{ lottery: '今彩539', cycleDate: '2026-09-21' }]);
  } finally { await db.close(); }
});

test('the existing retention cron dispatches once when pending, retries, and stops after repair', async () => {
  const db = await makeDb();
  try {
    await current(db, { completed: true });
    const at = '2026-09-21T14:01:00Z';
    const call = async () => db.query(`select private.matrix_retention_with_correction_tick($1::timestamptz)`, [at]);
    await call();
    await call();
    let http = await db.query(`select url,headers->>'x-matrix-watchdog-token' as token from private.test_http`);
    assert.deepEqual(http.rows, Array.from({ length: 2 }, () => ({
      url: 'https://project.test/functions/v1/admin-api/api/internal/matrix-watchdog', token: 'test-token',
    })));
    await db.exec(`update public.matrix_card_publications set card_ready=true`);
    await call();
    http = await db.query(`select count(*)::integer as count from private.test_http`);
    assert.equal(http.rows[0].count, 2);
    const cleanup = await db.query(`select count from private.test_cleanup`);
    assert.equal(cleanup.rows[0].count, 3);
  } finally { await db.close(); }
});

test('missing Vault configuration keeps the card pending without rolling back retention', async () => {
  const db = await makeDb();
  try {
    await current(db, { completed:true });
    await db.exec(`delete from vault.decrypted_secrets where name='matrix_admin_watchdog_token'`);
    await db.exec(`select private.matrix_retention_with_correction_tick('2026-09-21T14:01:00Z')`);
    const cleanup = await db.query(`select count from private.test_cleanup`);
    const requests = await db.query(`select count(*)::integer as count from private.test_http`);
    assert.equal(cleanup.rows[0].count, 1);
    assert.equal(requests.rows[0].count, 0);
    await db.exec(`insert into vault.decrypted_secrets values('matrix_admin_watchdog_token','test-token')`);
    await db.exec(`select private.matrix_retention_with_correction_tick('2026-09-21T14:02:00Z')`);
    const retried = await db.query(`select count(*)::integer as count from private.test_http`);
    assert.equal(retried.rows[0].count, 1);
  } finally { await db.close(); }
});

test('the same retention cron job and time are preserved without adding another job', () => {
  assert.match(sql, /cron\.schedule\(\s*'matrix-analysis-retention'\s*,\s*'17 \* \* \* \*'\s*,\s*'select private\.matrix_retention_with_correction_tick\(\);'\s*\)/i);
  assert.equal((sql.match(/cron\.schedule\(/g) ?? []).length, 1);
  assert.match(sql, /revoke all on function private\.matrix_late_correction_candidates\(timestamptz\)[^]*?service_role/i);
});

test('the complete migration runs atomically and replaces only the existing cron job', async () => {
  const db = await makeDb({ fullMigration: true });
  try {
    const result = await db.query('select jobname,schedule,command from cron.job order by jobname');
    assert.deepEqual(result.rows, [
      { jobname:'matrix-analysis-retention',schedule:'17 * * * *',
        command:'select private.matrix_retention_with_correction_tick();' },
      { jobname:'unrelated-job',schedule:'0 0 * * *',command:'select 1;' },
    ]);
    const acl = await db.query(`select
      has_function_privilege('anon','public.matrix_recovery_pending(timestamptz)','EXECUTE') as anon_pending,
      has_function_privilege('service_role','public.matrix_recovery_pending(timestamptz)','EXECUTE') as service_pending,
      has_function_privilege('service_role','private.matrix_late_correction_tick(timestamptz)','EXECUTE') as service_private`);
    assert.deepEqual(acl.rows, [{ anon_pending:false,service_pending:true,service_private:false }]);
  } finally { await db.close(); }
});
