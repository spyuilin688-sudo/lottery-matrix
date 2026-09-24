import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=n=>readFileSync(new URL(`../supabase/migrations/${n}`,import.meta.url),'utf8');
const migration=read('20260919180508_matrix_optimizer_history_schedule.sql');
const scalar=async(db,q,p=[])=>Object.values((await db.query(q,p)).rows[0])[0];
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema private;create schema cron;create schema vault;create schema net;
 create table cron.job(jobid bigint generated always as identity primary key,jobname text unique,schedule text,command text,active boolean default true);
 create function cron.schedule(n text,s text,c text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values(n,s,c) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid$$;
 create function cron.alter_job(job_id bigint,active boolean) returns void language sql as $$update cron.job set active=$2 where jobid=$1$$;
 create table vault.decrypted_secrets(name text,decrypted_secret text);
 create table net.requests(url text,headers jsonb,body jsonb);
 create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds int) returns bigint language plpgsql as $$begin insert into net.requests values(url,headers,body);return 1;end$$;
 create table system_job_status(job_name text,lottery text,status text,started_at timestamptz,finished_at timestamptz);`);
 await db.exec(read('20260904103000_add_matrix_watchdog_leases.sql'));
 await db.exec(read('20260910123745_admin_watchdog_status_store.sql'));
 await db.exec(migration);
 await db.exec(read('20260919181404_matrix_optimizer_cron_origin.sql'));
 // The generated migration precedes the existing PR's additive counter migration.
 await db.exec('alter table system_job_status add column retry_count bigint default 0,add column recovery_count bigint default 0,add column last_recovery_at timestamptz');
 return db;
}
test('optimizer history is private, owner-fenced, once per slot and retained for 90 days',async t=>{
 const db=await fixture();t.after(()=>db.close());
 const claim=(scope='railway',owner='a')=>scalar(db,'select matrix_optimizer_claim($1,$2)',[scope,owner]);
 const first=await claim();assert.equal(first.acquired,true);
 assert.equal((await claim('railway','b')).acquired,false);
 const report={checkedAt:first.observedAt,candidates:[],coverage:['railway-hourly']};
 const finish=(owner='a')=>scalar(db,'select matrix_optimizer_finish($1,$2,$3,$4,$5)',['railway',first.slot,owner,report,{railway:[]}]);
 assert.equal(await finish('b'),false);
 await db.exec("update matrix_watchdog_leases set expires_at=now()-interval '1 second'");
 assert.equal(await finish(),false);
 assert.equal((await claim()).acquired,true);
 assert.equal(await finish(),true);
 assert.equal((await claim('railway','b')).acquired,false);
 assert.equal(await scalar(db,"select count(*) from private.matrix_optimizer_observations"),1);
 assert.equal((await scalar(db,"select matrix_optimizer_latest('railway')")).checkedAt,report.checkedAt);
 await db.exec("insert into private.matrix_optimizer_observations values('database',now()-interval '91 days',now()-interval '91 days','{}','{}')");
 assert.equal(await scalar(db,"select matrix_optimizer_latest('database')"),null);
 assert.deepEqual((await scalar(db,"select matrix_optimizer_history('database',null,24)")).items,[]);
 assert.equal(await scalar(db,'select private.matrix_optimizer_prune()'),1);
 for(const role of ['anon','authenticated']){
  assert.equal(await scalar(db,"select has_table_privilege($1,'private.matrix_optimizer_observations','SELECT')",[role]),false);
  assert.equal(await scalar(db,"select has_function_privilege($1,'public.matrix_optimizer_finish(text,timestamptz,text,jsonb,jsonb)','EXECUTE')",[role]),false);
  assert.equal(await scalar(db,"select has_function_privilege($1,'public.matrix_optimizer_history(text,timestamptz,integer)','EXECUTE')",[role]),false);
 }
 assert.equal(await scalar(db,"select relrowsecurity from pg_class where oid='private.matrix_optimizer_observations'::regclass"),true);
 assert.deepEqual((await db.query('select schedule,active from cron.job order by jobname')).rows,[{schedule:'0 16 * * *',active:false},{schedule:'0 * * * *',active:false}]);
});
test('HTTP tick prunes even when credentials are absent, and sends only the selected optimizer scope',async t=>{
 const db=await fixture();t.after(()=>db.close());
 await db.exec("insert into private.matrix_optimizer_observations values('railway',now()-interval '91 days',now()-interval '91 days','{}','{}')");
 assert.equal(await scalar(db,"select private.matrix_optimizer_http_tick('railway')"),null);
 assert.equal(await scalar(db,'select count(*) from private.matrix_optimizer_observations'),0);
 await db.exec("insert into vault.decrypted_secrets values('matrix_project_url','https://example.supabase.co'),('matrix_admin_watchdog_token','test-only')");
 assert.equal(await scalar(db,"select private.matrix_optimizer_http_tick('database')"),1);
 assert.deepEqual(await scalar(db,'select body from net.requests'),{optimizer:true,optimizerScope:'database'});
 assert.equal((await scalar(db,'select headers from net.requests')).Origin,'https://matrixlottery.idv.tw');
});
test('normal heartbeat accepts chain evidence but never stores optimizer history',async t=>{
 const db=await fixture();t.after(()=>db.close());
 assert.equal(await scalar(db,'select admin_watchdog_status_write($1)',[{status:'degraded',railway:[{evidence:'x'.repeat(20000)}],optimizer:{history:'not-a-heartbeat'}}]),true);
 assert.equal((await scalar(db,'select admin_watchdog_status_read()')).optimizer,undefined);
 await assert.rejects(scalar(db,'select admin_watchdog_status_write($1)',[{status:'ok',value:'x'.repeat(270000)}]),/INVALID_WATCHDOG_STATUS/);
});
test('history pagination and slot validation cannot overwrite an existing report',async t=>{
 const db=await fixture();t.after(()=>db.close());
 const claim=await scalar(db,"select matrix_optimizer_claim('database','a')");
 const report={checkedAt:claim.observedAt,candidates:[],coverage:[]};
 assert.equal(await scalar(db,'select matrix_optimizer_finish($1,$2,$3,$4,$5)',['database',new Date(Date.parse(claim.slot)-3600000).toISOString(),'a',report,{}]),false);
 assert.equal(await scalar(db,'select matrix_optimizer_finish($1,$2,$3,$4,$5)',['database',claim.slot,'a',report,{}]),true);
 await db.exec("insert into private.matrix_optimizer_observations select 'database',now()-make_interval(days=>i),now()-make_interval(days=>i),'{}','{}' from generate_series(1,30) i");
 const first=await scalar(db,"select matrix_optimizer_history('database',null,24)");
 const second=await scalar(db,"select matrix_optimizer_history('database',$1,24)",[first.nextBefore]);
 assert.equal(first.items.length,24);assert.equal(second.items.length,7);
 assert.equal(new Set([...first.items,...second.items].map(r=>r.slot)).size,31);
 assert.deepEqual((await scalar(db,'select matrix_optimizer_job_counters()')).jobs,[]);
 await assert.rejects(scalar(db,"select matrix_optimizer_claim('unknown','a')"),/OPTIMIZER_SCOPE_INVALID/);
});
