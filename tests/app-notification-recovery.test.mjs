import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createAppNotificationDb } from './helpers/app-notification-db.mjs';
import { applyAppMigrations, identity, asUser, rpc } from './helpers/app-db.mjs';

const db = await createAppNotificationDb();
after(() => db.close());
// External scheduling, Vault and HTTP are boundaries; execute real App SQL.
await db.exec(`
  create schema vault; create schema net; create schema cron;
  create table vault.decrypted_secrets(name text, decrypted_secret text);
  insert into vault.decrypted_secrets values ('matrix_project_url','https://fixture.test'),('matrix_notification_dispatch_token','fixture-only');
  create table net.requests(id bigint generated always as identity, url text);
  create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer)
  returns bigint language plpgsql as $$ declare result bigint; begin
    if current_setting('test.http_failure',true)='1' then raise exception 'HTTP_UNAVAILABLE'; end if;
    insert into net.requests(url) values($1) returning id into result; return result;
  end; $$;
  create table cron.job(jobid bigint,jobname text,command text,schedule text);
  insert into cron.job values(1,'matrix-notification-recovery-fallback','select private.notification_recovery_tick(pg_catalog.now());','7 * * * *');
  create function cron.alter_job(job_id bigint,command text) returns void language sql as
    $$update cron.job set command=$2 where jobid=$1$$;
`);
await applyAppMigrations(db, ['app_notification_recovery']);
const enqueue = async () => {
  const id = randomUUID();
  await db.query("insert into notification_events(id,event_key,event_type,source,payload,occurred_at) values($1,$2,'lottery_result','railway',$3,now())", [id,id,{lottery:'今彩539',drawDate:'2026-09-26',numbers:['01','02','03','04','05']}]);
  return id;
};
const countRequests = async () => (await db.query('select count(*)::int n from net.requests')).rows[0].n;

test('idle recovery performs no HTTP request and retains the existing dynamic-recovery fallback schedule', async () => {
  const result = await db.query('select private.app_notification_recovery_tick() value');
  assert.equal(result.rows[0].value, null);
  assert.equal(await countRequests(), 0);
  const jobs = (await db.query('select * from cron.job')).rows;
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].schedule, '7 * * * *');
  assert.equal(jobs[0].jobname, 'matrix-notification-recovery-fallback');
  assert.ok(jobs[0].command.includes('private.notification_recovery_tick'));
  assert.ok(jobs[0].command.includes('private.app_notification_recovery_tick'));
});

test('source event wakes the App worker once per transaction without modifying PWA outbox', async () => {
  const user=await identity(db);
  await asUser(db,user,()=>rpc(db,'app_member_bootstrap'));
  const settings=await asUser(db,user,()=>rpc(db,'app_notification_settings_get'));
  settings.settings.result=true;
  await asUser(db,user,()=>rpc(db,'app_notification_settings_save',[settings]));
  await asUser(db,user,()=>rpc(db,'app_native_push_save',[randomUUID(),'fixture-token-'+randomUUID(),'android']));
  await db.exec('begin');
  await enqueue(); await enqueue();
  await db.exec('commit');
  assert.equal(await countRequests(),1);
  assert.equal((await db.query('select url from net.requests')).rows[0].url,'https://fixture.test/functions/v1/app-native-notification-dispatch');
  assert.equal((await db.query('select count(*)::int n from notification_outbox')).rows[0].n,0);
});

test('failed App wake preserves source and durable work, and recovery retries after retention', async () => {
  await db.exec("select set_config('test.http_failure','1',false)");
  const id=await enqueue();
  assert.equal((await db.query('select count(*)::int n from notification_events where id=$1',[id])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from private.app_native_push_events where id=$1',[id])).rows[0].n,1);
  await db.query('delete from notification_events where id=$1',[id]);
  await db.exec("select set_config('test.http_failure','0',false)");
  await db.query('select private.app_notification_recovery_tick()');
  assert.equal(await countRequests(),2);
  assert.equal((await db.query('select count(*)::int n from private.app_native_push_outbox where event_id=$1',[id])).rows[0].n,1);
});
