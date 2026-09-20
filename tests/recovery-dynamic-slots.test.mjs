import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync(new URL('../supabase/migrations/20260920233444_recovery_dynamic_slots.sql',import.meta.url),'utf8');
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema private; create schema cron; create schema vault; create schema net;
 create table cron.job(jobid bigint generated always as identity,jobname text unique,schedule text,command text);
 create function cron.schedule(job_name text,schedule text,command text) returns bigint language plpgsql as $$declare j bigint;begin insert into cron.job(jobname,schedule,command) values(job_name,schedule,command) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid into j;return j;end$$;
 create function cron.unschedule(job_name text) returns boolean language plpgsql as $$begin delete from cron.job where jobname=job_name;return found;end$$;
 create table private.notification_draw_day_overrides(lottery text,draw_date date,is_draw_day boolean,source_kind text,valid_until timestamptz);
 create table private.notification_draw_calendar_sync(lottery text,last_error text,last_success_at timestamptz,valid_until timestamptz,coverage_start date,coverage_end date);
 create function private.notification_is_draw_day(l text,d date) returns boolean language sql as $$select coalesce((select is_draw_day from private.notification_draw_day_overrides where lottery=l and draw_date=d limit 1),l<>'六合彩')$$;
 create table lottery_draws(lottery text,period text,draw_date date,result_status text);
 create table private.matrix_worker_completion(lottery text primary key,generation bigint,certified_generation bigint,draw_period text,valid_until timestamptz,certified_at timestamptz);
 create table system_job_status(job_name text,lottery text,status text,written_period text,recovery_count bigint);
 create table private.admin_watchdog_status(id boolean primary key,updated_at timestamptz,status jsonb);
 create table private.admin_watchdog_schedule(id boolean primary key,checked_at timestamptz,due boolean,pending_since timestamptz);
 create table private.test_chain(lottery text,period text,ready boolean);
 create function public.matrix_watchdog_chain_state(l text,p text) returns jsonb language sql as $$select jsonb_build_object('latestPeriod',period,'analysisComplete',ready,'matrixStatusComplete',ready) from private.test_chain where lottery=l and period=p$$;
 create table vault.decrypted_secrets(name text,decrypted_secret text);
 insert into vault.decrypted_secrets values('matrix_project_url','https://example.test'),('matrix_admin_watchdog_token','test');
 create table net.requests(body jsonb);
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) returns bigint language plpgsql as $$begin insert into net.requests values(body);return 1;end$$;
 select cron.schedule('matrix-admin-watchdog-v1','3-59/10 * * * *','old');`);
 await db.exec(sql);
 return db;
}
const scalar=async(db,q,p=[])=>Object.values((await db.query(q,p)).rows[0])[0];
const slots=async(db,g)=> (await db.query(`select to_char(slot at time zone 'Asia/Taipei','YYYY-MM-DD HH24:MI') t from private.matrix_recovery_slots($1,'2026-09-21') slot`,[g])).rows.map(r=>r.t);
test('exact fifty-minute slots and extra checks retain their original cycle',async t=>{
 const db=await fixture();t.after(()=>db.close());
 const e=await slots(db,'evening');
 assert.equal(e.length,35);assert.equal(e[0],'2026-09-21 20:30');
 assert.deepEqual(e.slice(27),['2026-09-22 01:00','2026-09-22 01:50','2026-09-22 02:40','2026-09-22 03:30','2026-09-22 04:20','2026-09-22 05:10','2026-09-22 12:00','2026-09-22 18:00']);
 const f=await slots(db,'fantasy5');assert.equal(f.length,34);
 assert.deepEqual(f.slice(27),['2026-09-21 14:00','2026-09-21 14:50','2026-09-21 15:40','2026-09-21 16:30','2026-09-21 17:20','2026-09-22 00:00','2026-09-22 06:00']);
 assert.ok(!e.includes('2026-09-22 06:00'));assert.ok(!f.includes('2026-09-21 18:00'));
});
test('old poller is removed and the two daily starts remain',async t=>{
 const db=await fixture();t.after(()=>db.close());
 assert.equal(await scalar(db,"select count(*) from cron.job where jobname='matrix-admin-watchdog-v1'"),0);
 assert.deepEqual((await db.query("select schedule from cron.job where jobname like 'matrix-recovery-start-%' order by schedule")).rows.map(r=>r.schedule),['30 1 * * *','30 12 * * *']);
});
test('completion cancels the matching cycle and no new check is dispatched',async t=>{
 const db=await fixture();t.after(()=>db.close());
 await db.query("select private.matrix_recovery_tick('fantasy5','2026-09-21T09:30:00+08')");
 assert.equal(await scalar(db,'select count(*) from net.requests'),1);
 await db.exec("insert into lottery_draws values('天天樂','42','2026-09-21','confirmed');insert into private.test_chain values('天天樂','42',true)");
 assert.equal(await scalar(db,"select public.matrix_recovery_complete('天天樂','42')"),true);
 assert.equal(await scalar(db,"select count(*) from cron.job where jobname='matrix-recovery-next-fantasy5'"),0);
 await db.query("select private.matrix_recovery_tick('fantasy5','2026-09-22T00:00:00+08')");
 assert.equal(await scalar(db,'select count(*) from net.requests'),1);
 assert.deepEqual(await scalar(db,"select public.matrix_recovery_pending('2026-09-22T00:00:00+08')"),[]);
 await db.query("select private.matrix_recovery_tick('fantasy5','2026-09-22T09:30:00+08')");
 assert.equal(await scalar(db,'select count(*) from net.requests'),2);
});
test('previous-period and preliminary data cannot cancel pending work',async t=>{
 const db=await fixture();t.after(()=>db.close());
 await db.query("select private.matrix_recovery_tick('fantasy5','2026-09-21T09:30:00+08')");
 await db.exec("insert into lottery_draws values('天天樂','41','2026-09-20','confirmed');insert into private.test_chain values('天天樂','41',true)");
 assert.equal(await scalar(db,"select public.matrix_recovery_complete('天天樂','41')"),false);
 await db.exec("update lottery_draws set draw_date='2026-09-21',result_status='preliminary'");
 assert.equal(await scalar(db,"select public.matrix_recovery_complete('天天樂','41')"),false);
});
test('HTTP failure keeps the next prescribed slot and avoids out-of-slot dispatch',async t=>{
 const db=await fixture();t.after(()=>db.close());
 await db.exec('delete from vault.decrypted_secrets');
 await db.query("select private.matrix_recovery_tick('fantasy5','2026-09-21T14:00:00+08')");
 assert.equal(await scalar(db,"select schedule from cron.job where jobname='matrix-recovery-next-fantasy5'"),'50 06 * * *');
 await db.query("select private.matrix_recovery_tick('fantasy5','2026-09-21T19:00:00+08')");
 assert.equal(await scalar(db,'select count(*) from net.requests'),0);
 assert.equal(await scalar(db,"select schedule from cron.job where jobname='matrix-recovery-next-fantasy5'"),'00 16 * * *');
});
test('no-draw is skipped but an unknown Mark Six calendar is not completion',async t=>{
 const db=await fixture();t.after(()=>db.close());
 await db.exec("insert into private.notification_draw_day_overrides values('今彩539','2026-09-21',false,'manual',null),('大樂透','2026-09-21',false,'manual',null)");
 await db.query("select private.matrix_recovery_tick('evening','2026-09-21T20:30:00+08')");
 const pending=await scalar(db,"select public.matrix_recovery_pending('2026-09-21T20:30:01+08')");
 assert.deepEqual(pending.map(r=>r.lottery),['六合彩']);
});
test('members cannot forge completion or change schedule',async t=>{
 const db=await fixture();t.after(()=>db.close());
 for(const role of ['anon','authenticated']){
  assert.equal(await scalar(db,"select has_function_privilege($1,'public.matrix_recovery_complete(text,text)','execute')",[role]),false);
  assert.equal(await scalar(db,"select has_function_privilege($1,'public.matrix_recovery_pending(timestamptz)','execute')",[role]),false);
  assert.equal(await scalar(db,"select has_table_privilege($1,'private.matrix_recovery_schedule','update')",[role]),false);
 }
});
test('a worker certificate cancels its remaining checks through the real trigger',async t=>{
 const db=await fixture();t.after(()=>db.close());
 await db.query("select private.matrix_recovery_tick('fantasy5',now(),false)");
 await db.exec("insert into lottery_draws select '天天樂','42',cycle_date,'confirmed' from private.matrix_recovery_schedule where lottery='天天樂';insert into private.test_chain values('天天樂','42',true)");
 await db.exec("insert into private.matrix_worker_completion values('天天樂',1,1,'42',now()+interval '2 days',now())");
 assert.equal(await scalar(db,"select completed_at is not null from private.matrix_recovery_schedule where lottery='天天樂'"),true);
 assert.equal(await scalar(db,"select count(*) from cron.job where jobname='matrix-recovery-next-fantasy5'"),0);
});
test('one completed lottery is excluded while the other evening lotteries continue',async t=>{
 const db=await fixture();t.after(()=>db.close());
 await db.query("select private.matrix_recovery_tick('evening','2026-09-21T20:30:00+08')");
 await db.exec("insert into lottery_draws values('今彩539','42','2026-09-21','confirmed');insert into private.test_chain values('今彩539','42',true)");
 await scalar(db,"select public.matrix_recovery_complete('今彩539','42')");
 await db.query("select private.matrix_recovery_tick('evening','2026-09-22T01:50:00+08')");
 assert.deepEqual((await scalar(db,"select public.matrix_recovery_pending('2026-09-22T01:50:00+08')")).map(r=>r.lottery).sort(),['六合彩','大樂透'].sort());
});
test('a late tick skips missed slots instead of starting recovery outside its window',async t=>{
 const db=await fixture();t.after(()=>db.close());
 await db.query("select private.matrix_recovery_tick('fantasy5','2026-09-21T09:30:00+08')");
 await db.query("select private.matrix_recovery_tick('fantasy5','2026-09-21T18:00:00+08')");
 assert.equal(await scalar(db,'select count(*) from net.requests'),1);
 assert.equal(await scalar(db,"select schedule from cron.job where jobname='matrix-recovery-next-fantasy5'"),'00 16 * * *');
});
test('calendar updates skip and rearm an unfinished cycle without dispatch',async t=>{
 const db=await fixture();t.after(()=>db.close());
 await db.query("select private.matrix_recovery_tick('evening',now(),false)");
 await db.exec("insert into private.notification_draw_day_overrides select lottery,cycle_date,false,'manual',null from private.matrix_recovery_schedule where lottery='六合彩'");
 assert.equal(await scalar(db,"select skip_reason from private.matrix_recovery_schedule where lottery='六合彩'"),'no-draw');
 await db.exec("update private.notification_draw_day_overrides set is_draw_day=true where lottery='六合彩'");
 assert.equal(await scalar(db,"select skip_reason from private.matrix_recovery_schedule where lottery='六合彩'"),null);
 assert.equal(await scalar(db,'select count(*) from net.requests'),0);
});
