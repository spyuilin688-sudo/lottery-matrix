import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';

// These fixture tables model only columns read by the aggregate; they do not
// implement native dispatch, FCM or member delivery behavior.
test('native health stays private, read-only and honest across optional-schema and queue states', async () => {
const db = new PGlite();
const sql = await readFile(new URL('../migrations/20260913190028_admin_native_notification_health.sql', import.meta.url), 'utf8');
const health = async () => (await db.query('select public.admin_native_notification_health() as health')).rows[0].health;
let checks = 0;
const checked = (name) => { checks++; process.stdout.write(`ok ${checks} - ${name}\n`); };
try {
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(sql);
  assert.equal(await health(), null);
  checked('function installs before optional native and cron schemas and returns unavailable');
  await db.exec(`
    create schema private;
    create table private.native_push_devices (installation_id uuid primary key, token text not null, enabled boolean not null);
    create table private.native_push_deliveries (
      id uuid primary key, status text not null check (status in ('pending','processing','sent','failed','canceled')),
      next_attempt_at timestamptz, lease_until timestamptz, finished_at timestamptz
    );
  `);
  assert.equal(await health(), null);
  checked('native present but cron absent remains unavailable');
  await db.exec(`
    create schema cron;
    create table cron.job (jobid bigint primary key, jobname text, schedule text, active boolean, command text);
    create table cron.job_run_details (runid bigint primary key, jobid bigint, status text, start_time timestamptz, end_time timestamptz, command text, return_message text);
  `);
  const noJob = await health();
  assert.equal(noJob.enabled_devices, 0);
  assert.equal(noJob.schedule.enabled, false);
  assert.equal(noJob.schedule.last_status, null);
  checked('missing cron job is disabled with no fabricated successful run');
  await db.exec(`
    insert into private.native_push_devices values ('f17ea001-0000-4000-8000-000000000001', 'DEVICE_TOKEN_MUST_NOT_LEAK', false);
    insert into cron.job values (6, 'matrix-native-notification-dispatch-minute', '* * * * *', true, 'DISPATCH_SECRET_MUST_NOT_LEAK');
    insert into cron.job_run_details values (1,6,'succeeded', now()-interval '1 minute', now()-interval '59 seconds','RAW_COMMAND_MUST_NOT_LEAK','RAW_RESPONSE_MUST_NOT_LEAK');
    insert into private.native_push_deliveries values
      ('f17ea001-0000-4000-8000-000000000002','sent',null,null,now()-interval '4 days'),
      ('f17ea001-0000-4000-8000-000000000003','failed',null,null,now()-interval '3 days');
  `);
  const idle = await health();
  assert.equal(idle.enabled_devices, 0);
  assert.equal(idle.schedule.enabled, true);
  assert.equal(idle.schedule.every_minute, true);
  assert.equal(idle.schedule.last_status, 'succeeded');
  assert.equal(idle.deliveries.sent_24h, 0);
  assert.equal(idle.deliveries.failed_24h, 0);
  assert.ok(idle.deliveries.last_sent_at);
  assert.ok(idle.deliveries.last_failed_at);
  assert.doesNotMatch(JSON.stringify(idle), /MUST_NOT_LEAK|f17ea001|command|token|installation/);
  checked('zero enabled devices and old results remain facts, with safe aggregate redaction');
  await db.exec(`
    insert into private.native_push_deliveries values
      ('f17ea001-0000-4000-8000-000000000004','pending',now()-interval '6 minutes',null,null),
      ('f17ea001-0000-4000-8000-000000000005','pending',now()+interval '1 hour',null,null),
      ('f17ea001-0000-4000-8000-000000000006','processing',null,now()-interval '6 minutes',null),
      ('f17ea001-0000-4000-8000-000000000007','processing',null,now()+interval '1 minute',null),
      ('f17ea001-0000-4000-8000-000000000008','sent',null,null,now()-interval '1 hour'),
      ('f17ea001-0000-4000-8000-000000000009','failed',null,null,now()-interval '2 hours'),
      ('f17ea001-0000-4000-8000-000000000010','canceled',null,null,now()-interval '3 hours');
  `);
  const queue = await health();
  assert.deepEqual(Object.fromEntries(Object.entries(queue.deliveries).filter(([key]) => !key.startsWith('last_'))), {
    pending: 2, processing: 2, overdue: 2, sent_24h: 1, failed_24h: 1, canceled_24h: 1,
  });
  checked('counts overdue pending and expired leases while excluding scheduled retries and active leases');
  await db.exec("insert into cron.job_run_details values (2,6,'failed',now()-interval '30 seconds',now()-interval '29 seconds','SECRET_COMMAND','RAW_SQL_FAILURE');");
  const failed = await health();
  assert.equal(failed.schedule.last_status, 'failed');
  assert.doesNotMatch(JSON.stringify(failed), /SECRET|RAW_SQL/);
  checked('latest cron failure is preserved without command or raw SQL error data');
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(health, error => error.code === '42501');
    await db.exec('reset role');
    checked(`${role} cannot execute the health RPC`);
  }
  const privileges = (await db.query(`select p.provolatile, p.prosecdef, p.proconfig,
    pg_catalog.has_function_privilege('service_role','public.admin_native_notification_health()','execute') as service_allowed,
    exists(select 1 from pg_catalog.aclexplode(p.proacl) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_allowed
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_native_notification_health'`)).rows[0];
  assert.deepEqual(privileges, { provolatile: 's', prosecdef: true, proconfig: ['search_path=""'], service_allowed: true, public_allowed: false });
  checked('stable function has an empty search_path and no PUBLIC execute grant');
  const before = (await db.query('select count(*)::int as n from private.native_push_deliveries')).rows[0].n;
  await db.exec('begin read only; set local role service_role;');
  assert.equal((await health()).deliveries.pending, 2);
  await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int as n from private.native_push_deliveries')).rows[0].n, before);
  checked('service_role reads through a read-only transaction without changing the queue');
  process.stdout.write(`1..${checks}\n`);
} finally {
  await db.close();
}

});
