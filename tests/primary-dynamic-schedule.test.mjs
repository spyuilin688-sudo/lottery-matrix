import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const sql = readFileSync(
  new URL('../supabase/migrations/20260921072423_dynamic_primary_worker_schedule.sql', import.meta.url),
  'utf8',
);

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private; create schema cron; create schema vault; create schema net;
    create table cron.job(jobid bigint generated always as identity,jobname text unique,schedule text,command text);
    create function cron.schedule(job_name text,schedule text,command text) returns bigint language plpgsql as $$
      declare j bigint; begin
        insert into cron.job(jobname,schedule,command) values(job_name,schedule,command)
        on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command
        returning jobid into j; return j;
      end $$;
    create function cron.unschedule(job_name text) returns boolean language plpgsql as $$
      begin delete from cron.job where jobname=job_name; return found; end $$;
    create table private.notification_draw_day_overrides(lottery text,draw_date date,is_draw_day boolean,source_kind text,valid_until timestamptz);
    create table private.notification_draw_calendar_sync(lottery text,last_error text,last_success_at timestamptz,valid_until timestamptz,coverage_start date,coverage_end date);
    create function private.notification_is_draw_day(l text,d date) returns boolean language sql as $$
      select coalesce((select is_draw_day from private.notification_draw_day_overrides where lottery=l and draw_date=d limit 1),l<>'六合彩') $$;
    create function private.matrix_recovery_draw_due(l text,d date,n timestamptz) returns boolean language sql as $$
      select case when l<>'六合彩' then private.notification_is_draw_day(l,d)
      when exists(select 1 from private.notification_draw_day_overrides where lottery=l and draw_date=d and source_kind='manual')
      then private.notification_is_draw_day(l,d)
      when exists(select 1 from private.notification_draw_calendar_sync where lottery=l and last_error is null and last_success_at<=n and valid_until>n and d between coverage_start and coverage_end)
      then private.notification_is_draw_day(l,d) else true end $$;
    create table lottery_draws(lottery text,period text,draw_date date,result_status text);
    create table private.matrix_worker_completion(lottery text primary key,generation bigint,certified_generation bigint,draw_period text,valid_until timestamptz,certified_at timestamptz);
    create table private.test_chain(lottery text,period text,ready boolean);
    create function public.matrix_watchdog_chain_state(l text,p text) returns jsonb language sql as $$
      select jsonb_build_object('latestPeriod',period,'analysisComplete',ready,'matrixStatusComplete',ready)
      from private.test_chain where lottery=l and period=p $$;
    create table vault.decrypted_secrets(name text,decrypted_secret text);
    insert into vault.decrypted_secrets values('matrix_project_url','https://example.test'),('matrix_admin_watchdog_token','test');
    create table net.requests(url text,body jsonb);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) returns bigint language plpgsql as $$
      begin insert into net.requests values(url,body); return 1; end $$;
    select cron.schedule('matrix-recovery-start-evening','30 12 * * *','recovery-evening');
    select cron.schedule('matrix-recovery-start-fantasy5','30 1 * * *','recovery-fantasy5');
  `);
  await db.exec(sql);
  return db;
}

const scalar = async (db, query, params = []) => Object.values((await db.query(query, params)).rows[0])[0];
const slots = async (db, group, day) => (await db.query(
  `select to_char(slot at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI') t
   from private.matrix_primary_slots($1,$2) slot`, [group, day],
)).rows.map(row => row.t);

test('primary slots use ten minutes, then thirty minutes, and stop at cutoffs', async t => {
  const db = await fixture(); t.after(() => db.close());
  const evening = await slots(db, 'evening', '2026-09-21');
  assert.equal(evening[0], '2026-09-21 20:30');
  assert.equal(evening.at(-1), '2026-09-22 05:30');
  assert.equal(evening.length, 37);
  assert.deepEqual(evening.slice(26, 31), [
    '2026-09-22 00:50', '2026-09-22 01:00', '2026-09-22 01:30',
    '2026-09-22 02:00', '2026-09-22 02:30',
  ]);
  const fantasy = await slots(db, 'fantasy5', '2026-09-21');
  assert.equal(fantasy[0], '2026-09-21 09:30');
  assert.equal(fantasy.at(-1), '2026-09-21 17:30');
  assert.equal(fantasy.length, 35);
  assert.deepEqual(fantasy.slice(26, 31), [
    '2026-09-21 13:50', '2026-09-21 14:00', '2026-09-21 14:30',
    '2026-09-21 15:00', '2026-09-21 15:30',
  ]);
});

test('primary scheduler coexists with recovery and dispatches only due lotteries', async t => {
  const db = await fixture(); t.after(() => db.close());
  await db.exec("insert into private.notification_draw_day_overrides values('大樂透','2026-09-21',false,'manual',null),('六合彩','2026-09-21',false,'manual',null)");
  await db.query("select private.matrix_primary_tick('evening','2026-09-21T20:30:00+08')");
  assert.equal(await scalar(db, 'select count(*) from net.requests'), 1);
  const request = (await db.query('select * from net.requests')).rows[0];
  assert.match(request.url, /matrix-primary$/);
  assert.deepEqual(request.body, {
    group: 'evening', cycleDate: '2026-09-21', lotteries: ['今彩539'],
  });
  assert.equal(await scalar(db, "select schedule from cron.job where jobname='matrix-primary-next-evening'"), '40 12 * * *');
  assert.equal(await scalar(db, "select count(*) from cron.job where jobname like 'matrix-recovery-%'"), 2);
});

test('previous or preliminary draws never certify primary completion', async t => {
  const db = await fixture(); t.after(() => db.close());
  await db.exec("insert into private.notification_draw_day_overrides values('大樂透','2026-09-21',false,'manual',null),('六合彩','2026-09-21',false,'manual',null)");
  await db.query("select private.matrix_primary_tick('evening','2026-09-21T20:30:00+08')");
  await db.exec("insert into lottery_draws values('今彩539','42','2026-09-20','confirmed'); insert into private.test_chain values('今彩539','42',true)");
  assert.equal(await scalar(db, "select private.matrix_primary_group_complete('evening','2026-09-21','2026-09-21T21:00:00+08')"), false);
  await db.exec("update lottery_draws set draw_date='2026-09-21',result_status='preliminary'");
  assert.equal(await scalar(db, "select private.matrix_primary_group_complete('evening','2026-09-21','2026-09-21T21:00:00+08')"), false);
});

test('a confirmed draw without a verified analysis chain remains pending', async t => {
  const db = await fixture(); t.after(() => db.close());
  await db.exec("insert into private.notification_draw_day_overrides values('大樂透','2026-09-21',false,'manual',null),('六合彩','2026-09-21',false,'manual',null); insert into lottery_draws values('今彩539','42','2026-09-21','confirmed')");
  assert.equal(await scalar(db, "select private.matrix_primary_group_complete('evening','2026-09-21','2026-09-21T21:00:00+08')"), false);
  await db.query("select private.matrix_primary_tick('evening','2026-09-21T21:00:00+08')");
  assert.deepEqual((await db.query('select body from net.requests')).rows[0].body.lotteries, ['今彩539']);
});

test('members cannot execute or mutate the primary scheduler', async t => {
  const db = await fixture(); t.after(() => db.close());
  for (const role of ['anon', 'authenticated']) {
    assert.equal(await scalar(db, "select has_function_privilege($1,'private.matrix_primary_tick(text,timestamptz,boolean)','execute')", [role]), false);
    assert.equal(await scalar(db, "select has_table_privilege($1,'private.matrix_primary_schedule','update')", [role]), false);
  }
});
