import { randomUUID } from 'node:crypto';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import { createAppNotificationDb } from './helpers/app-notification-db.mjs';
import { applyAppMigrations,identity,asUser,rpc } from './helpers/app-db.mjs';
const db=await createAppNotificationDb();after(()=>db.close());
await db.exec(`create schema cron;create table cron.job(jobid bigint,jobname text,command text,schedule text);
insert into cron.job select ord,name,'select private.notification_bet_reminders_publish_tick(pg_catalog.now());','original schedule' from unnest(array['0500-0730','0800','0900','1600-1830','1900','2000','2100']) with ordinality t(name,ord);
update cron.job set jobname='matrix-notification-bet-'||jobname;
create function cron.alter_job(job_id bigint,command text) returns void language sql as $$update cron.job set command=$2 where jobid=$1$$;
create table private.test_app_wakes(id integer);
create function private.app_notification_recovery_tick() returns bigint language plpgsql as $$begin insert into private.test_app_wakes values(1);return 1;end$$;`);
await applyAppMigrations(db,['app_selected_time_reminders']);
const who=await identity(db);
const member=await asUser(db,who,()=>rpc(db,'app_member_bootstrap'));
const settings=await asUser(db,who,()=>rpc(db,'app_notification_settings_get'));
settings.settings.bet=true;settings.betTimes['今彩539']=['19:00','19:00'];
await asUser(db,who,()=>rpc(db,'app_notification_settings_save',[settings]));
const tick=async at=>(await db.query('select private.app_selected_time_reminders_tick($1) value',[at])).rows[0].value;
test('selected-time App reminders are durable, member scoped, idempotent and never PWA events',async()=>{
 assert.equal((await tick('2026-09-26T11:00:00Z')).created,1);
 assert.equal((await tick('2026-09-26T11:00:00Z')).created,0);
 const events=(await db.query('select * from private.app_native_push_events')).rows;
 assert.equal(events.length,1);assert.equal(events[0].payload.memberId,member.memberId);
 assert.equal(events[0].event_type,'bet_reminder');
 assert.equal((await db.query('select count(*)::int n from notification_events')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from notification_outbox')).rows[0].n,0);
 assert.equal((await db.query('select private.notification_reminder_is_due($1,$2) ok',[events[0].payload,'2026-09-26T11:00:01Z'])).rows[0].ok,true);
});
test('a due personal reminder reaches native prepare for only its App device',async()=>{
 await db.exec("insert into private.notification_draw_day_overrides values('今彩539',(now() at time zone 'Asia/Taipei')::date,true);");
 const installation=randomUUID();
 await asUser(db,who,()=>rpc(db,'app_native_push_save',[installation,'fixture-token-'+installation,'android']));
 // Advance the generated event to the fixture's real delivery clock; keep the
 // producer's member/lottery payload and validate through actual fanout/claim.
 await db.exec("update private.app_native_push_events set created_at=now(),payload=jsonb_set(payload,'{scheduledAt}',to_jsonb(to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD\"T\"HH24:MI:SS')||'+08:00')); ");
 const [claim]=await rpc(db,'app_native_notification_claim',[20]);assert.ok(claim);
 const delivery=await rpc(db,'app_native_notification_prepare',[claim.delivery_id,claim.claim_id]);
 assert.equal(delivery.token,'fixture-token-'+installation);
 await db.exec("delete from private.notification_draw_day_overrides where lottery='今彩539' and draw_date=(now() at time zone 'Asia/Taipei')::date;");
 assert.equal((await db.query('select count(*)::int n from private.app_native_push_outbox')).rows[0].n,1);
});
test('disabled, wrong-minute and non-draw-day members receive no new reminder',async()=>{
 assert.equal((await tick('2026-09-26T11:30:00Z')).created,0);
 assert.equal((await tick('2026-09-27T11:00:00Z')).created,0);
 await db.query("update app_members set status='disabled' where id=$1",[member.memberId]);
 assert.equal((await tick('2026-09-28T11:00:00Z')).created,0);
});
test('reuses existing fixed-time jobs and preserves their PWA producer and schedules',async()=>{
 const jobs=(await db.query('select * from cron.job')).rows;assert.equal(jobs.length,7);
 for(const job of jobs){assert.equal(job.schedule,'original schedule');assert.match(job.command,/notification_bet_reminders_publish_tick/);assert.match(job.command,/app_selected_time_reminders_publish_tick/);}
});
