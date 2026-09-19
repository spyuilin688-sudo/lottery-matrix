import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
const read = name => readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
// Literal paths keep the scoped-test selector aware of every migration covered here.
const migrations = [
 read('20260920001000_matrix_chain_evidence.sql'),
 read('20260920002000_matrix_verified_recovery.sql'),
 read('20260920003000_matrix_custom_status_guard.sql'),
 read('20260920004000_matrix_missing_artifact_recovery.sql'),
 read('20260920005000_matrix_optimizer_snapshot.sql'),
];
async function fixture() {
 const db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema private; create schema auth;
 create function auth.role() returns text language sql as $$select 'service_role'::text$$;
 create table public.lottery_draws(lottery text, period text, draw_date date, primary key(lottery,period));
 create table public.matrix_analysis_runs(id uuid default gen_random_uuid() primary key, lottery text,draw_period text,analysis_version text,phase text,cursor int default 0,total int default 0,status text,started_at timestamptz default now(),updated_at timestamptz default now(),completed_at timestamptz,error text,lease_owner text,lease_expires_at timestamptz,unique(lottery,draw_period,analysis_version));
 create table private.matrix_analysis_active_versions(lottery text,draw_period text,number_order text,analysis_version text,activated_at timestamptz,primary key(lottery,draw_period,number_order));
 create table public.matrix_analysis_artifacts(lottery text,draw_period text,analysis_version text,kind text);
 create table public.matrix_custom_status_configs(member_id uuid,lottery text,status text,config jsonb,primary key(member_id,lottery,status));
 create table public.matrix_custom_status_results(member_id uuid,lottery text,analysis_version text,draw_period text,config_key text,standard_payload jsonb,composite_payload jsonb,updated_at timestamptz,primary key(member_id,lottery));
 create table public.system_job_status(job_name text primary key,lottery text,status text,started_at timestamptz,finished_at timestamptz,updated_at timestamptz,error text,written_period text);
 create function private.matrix_analysis_draw_order_eligible(text,text) returns boolean language sql as $$select $1 <> '天天樂'$$;
 create function private.matrix_analysis_missing_kinds(text,text,text) returns text[] language sql as $$select coalesce(array_agg(k),array[]::text[]) from unnest(array['explore','tianheng','tianyan','tiangong','status']) k where not exists(select 1 from public.matrix_analysis_artifacts a where a.lottery=$1 and a.draw_period=$2 and a.analysis_version=$3 and a.kind=k)$$;`);
 const currentKinds=read('20260919101456_matrix_tianshu.sql').match(/CREATE OR REPLACE FUNCTION private\.matrix_analysis_missing_kinds[\s\S]*?\$function\$;/)[0];
 await db.exec(currentKinds);
 const normalization=read('20260908040432_matrix_custom_status_v2.sql');
 await db.exec(normalization.slice(0,normalization.indexOf('-- Preserve the authenticated')));
 await db.exec(read('20260904103000_add_matrix_watchdog_leases.sql'));
 await db.exec(read('20260916095000_watchdog_active_analysis_state.sql'));
 for(const migration of migrations) await db.exec(migration);
 await db.exec(`insert into lottery_draws values ('天天樂','12004','2026-09-19');
 insert into matrix_analysis_runs(lottery,draw_period,analysis_version,status,phase) values('天天樂','12004','12004:matrix-python-v15-sorted','complete','complete');
 insert into private.matrix_analysis_active_versions values('天天樂','12004','sorted','12004:matrix-python-v15-sorted',now());
 insert into matrix_analysis_artifacts select '天天樂','12004','12004:matrix-python-v15-sorted',k from unnest(array['explore','tianheng','tianshu','tianyan','tiangong','status']) k;`);
 return db;
}
const scalar=async(db,query,params=[]) => Object.values((await db.query(query,params)).rows[0])[0];
test('chain, guarded publication, and atomic recovery use real SQL', async t => {
 const db=await fixture(); t.after(()=>db.close());
 const chain=()=>scalar(db,"select matrix_watchdog_chain_state('天天樂','12004')");
 const optimization=await scalar(db,'select matrix_optimizer_snapshot()');
 assert.ok(Array.isArray(optimization.indexes));
 assert.ok(Array.isArray(optimization.tables));
 assert.equal(optimization.statements,null);
 assert.equal((await chain()).analysisComplete,true);
 assert.equal((await chain()).customStatusComplete,true);
 await db.exec("delete from matrix_analysis_artifacts where kind='status'");
 assert.equal((await chain()).analysisComplete,false); // complete run alone is not proof
 assert.equal((await chain()).matrixStatusComplete,false);
 const run=await scalar(db,"select matrix_analysis_acquire_run('天天樂','12004','12004:matrix-python-v15-sorted','runner',now(),300)");
 assert.equal(run.lease_acquired,true); assert.equal(run.phase,'status');
 assert.equal((await scalar(db,"select matrix_analysis_acquire_run('天天樂','12004','12004:matrix-python-v15-sorted','other',now(),300)")).lease_acquired,false);
 await db.exec("insert into matrix_analysis_artifacts values('天天樂','12004','12004:matrix-python-v15-sorted','status'); update matrix_analysis_runs set status='complete'");
 const member='11111111-1111-1111-1111-111111111111';
 const config={schemaVersion:2,lottery:'天天樂',status:'ACTIVE',explorePeriods:13,exploreRange:'完整範圍',oneCodeGroups:[],twoCodeGroups:[]};
 await db.query('insert into matrix_custom_status_configs values($1,$2,$3,$4)',[member,'天天樂','ACTIVE',config]);
 assert.equal((await chain()).customMissing,1);
 const result={member_id:member,lottery:'天天樂',analysis_version:'12004:matrix-python-v15-sorted',draw_period:'12004',config_key:JSON.stringify([config]),standard_payload:{},composite_payload:{}};
 assert.equal(await scalar(db,'select matrix_custom_status_publish($1)',[result]),true);
 assert.equal((await chain()).customStatusComplete,true);
 await db.query("update matrix_custom_status_configs set config=jsonb_set(config,'{status}','\"FOCUS\"'),status='FOCUS'");
 assert.equal(await scalar(db,'select matrix_custom_status_clear_if_unconfigured($1,$2)',[member,'天天樂']),false);
 assert.equal(Number(await scalar(db,'select count(*) from matrix_custom_status_results')),1);
 assert.equal(await scalar(db,'select matrix_custom_status_publish($1)',[result]),false);
 assert.equal((await chain()).customStatusComplete,false);
 await db.query("update matrix_custom_status_configs set config=$1,status='ACTIVE'",[config]);
 assert.equal(await scalar(db,"select claim_matrix_watchdog_lease('railway:天天樂','owner',1200)"),true);
 assert.equal(await scalar(db,"select begin_matrix_watchdog_recovery('railway:天天樂','owner','runner',1200)"),true);
 assert.equal(await scalar(db,"select begin_matrix_watchdog_recovery('railway:天天樂','owner','runner',1200)"),false);
 assert.equal(Number(await scalar(db,"select retry_count from system_job_status")),1);
 assert.equal(await scalar(db,"select complete_matrix_watchdog_recovery('天天樂','owner','wrong','12004')"),false);
 assert.equal(await scalar(db,"select complete_matrix_watchdog_recovery('天天樂','owner','runner','12004')"),true);
 assert.equal(await scalar(db,"select complete_matrix_watchdog_recovery('天天樂','owner','runner','12004')"),false);
 assert.equal(Number(await scalar(db,"select recovery_count from system_job_status")),1);
 await db.exec("insert into lottery_draws values('天天樂','12005','2026-09-20'); select claim_matrix_watchdog_lease('railway:天天樂','next',1200); select begin_matrix_watchdog_recovery('railway:天天樂','next','runner2',1200)");
 assert.equal(await scalar(db,'select matrix_custom_status_publish($1)',[result]),false);
 assert.equal(await scalar(db,"select complete_matrix_watchdog_recovery('天天樂','next','runner2','12004')"),false);
 await db.exec("update matrix_watchdog_leases set expires_at=now()-interval '1 second'");
 assert.equal(await scalar(db,"select complete_matrix_watchdog_recovery('天天樂','next','runner2','12005')"),false);
 assert.equal(Number(await scalar(db,"select recovery_count from system_job_status")),1);
 for(const role of ['anon','authenticated']) {
  assert.equal(await scalar(db,"select has_function_privilege($1,'public.matrix_watchdog_chain_state(text,text)','EXECUTE')",[role]),false);
  assert.equal(await scalar(db,"select has_function_privilege($1,'public.complete_matrix_watchdog_recovery(text,text,text,text)','EXECUTE')",[role]),false);
  assert.equal(await scalar(db,"select has_function_privilege($1,'public.matrix_custom_status_publish(jsonb)','EXECUTE')",[role]),false);
  assert.equal(await scalar(db,"select has_function_privilege($1,'public.matrix_custom_status_clear_if_unconfigured(uuid,text)','EXECUTE')",[role]),false);
 }
 await db.exec('delete from matrix_custom_status_configs');
 assert.equal(await scalar(db,'select matrix_custom_status_clear_if_unconfigured($1,$2)',[member,'天天樂']),true);
 assert.equal(Number(await scalar(db,'select count(*) from matrix_custom_status_results')),0);
});

test('missing active pointers require the exact complete versions and current recovery lease', async t => {
 const db=await fixture(); t.after(()=>db.close());
 const version='12004:matrix-python-v15-sorted';
 const restore=(versions={sorted:version},owner='owner',runner='runner')=>scalar(db,
  "select matrix_restore_analysis_pointers('天天樂','12004',$1,$2,$3)",[versions,owner,runner]);
 await db.exec("delete from private.matrix_analysis_active_versions");
 assert.equal(await restore(),false);
 await db.exec("select claim_matrix_watchdog_lease('railway:天天樂','owner',1200); select begin_matrix_watchdog_recovery('railway:天天樂','owner','runner',1200)");
 assert.equal(await restore({sorted:version},'other'),false);
 assert.equal(await restore({sorted:version},'owner','other'),false);
 assert.equal(await restore({sorted:'12004:matrix-python-v14-sorted'}),false);
 await db.exec("delete from matrix_analysis_artifacts where kind='status'");
 assert.equal(await restore(),false);
 await db.exec("insert into matrix_analysis_artifacts values('天天樂','12004','12004:matrix-python-v15-sorted','status')");
 assert.equal(await restore(),true);
 assert.equal(await scalar(db,'select analysis_version from private.matrix_analysis_active_versions'),version);
 assert.equal((await scalar(db,"select matrix_watchdog_chain_state('天天樂','12004')")).analysisComplete,true);
 assert.equal(Number(await scalar(db,'select recovery_count from system_job_status')),0);
 await db.exec("update private.matrix_analysis_active_versions set analysis_version='12004:matrix-python-v16-sorted'");
 assert.equal(await restore(),false);
 assert.equal(await scalar(db,'select analysis_version from private.matrix_analysis_active_versions'),'12004:matrix-python-v16-sorted');
 await db.exec("delete from private.matrix_analysis_active_versions; update matrix_watchdog_leases set expires_at=now()-interval '1 second'");
 assert.equal(await restore(),false);
 await db.exec("update matrix_watchdog_leases set expires_at=now()+interval '10 minutes'; insert into lottery_draws values('天天樂','12005','2026-09-20')");
 assert.equal(await restore(),false);
 assert.equal(Number(await scalar(db,'select count(*) from private.matrix_analysis_active_versions')),0);
 for(const role of ['anon','authenticated']) assert.equal(await scalar(db,"select has_function_privilege($1,'public.matrix_restore_analysis_pointers(text,text,jsonb,text,text)','EXECUTE')",[role]),false);
});

test('paired pointer recovery never publishes half a pair or replaces another version', async t => {
 const db=await fixture(); t.after(()=>db.close());
 await db.exec(`insert into lottery_draws values('今彩539','115000211','2026-09-19');
 insert into matrix_analysis_runs(lottery,draw_period,analysis_version,status,phase)
 select '今彩539','115000211','115000211:matrix-python-v15-'||o,'complete','complete' from unnest(array['sorted','draw']) o;
 insert into matrix_analysis_artifacts select '今彩539','115000211','115000211:matrix-python-v15-'||o,kind
 from matrix_analysis_artifacts,unnest(array['sorted','draw']) o where lottery='天天樂';
 select claim_matrix_watchdog_lease('railway:今彩539','owner',1200);
 select begin_matrix_watchdog_recovery('railway:今彩539','owner','runner',1200);`);
 const versions={sorted:'115000211:matrix-python-v15-sorted',draw:'115000211:matrix-python-v15-draw'};
 const restore=(v=versions)=>scalar(db,"select matrix_restore_analysis_pointers('今彩539','115000211',$1,'owner','runner')",[v]);
 assert.equal(await restore({sorted:versions.sorted}),false);
 assert.equal(await restore({...versions,draw:'115000211:matrix-python-v16-draw'}),false);
 await db.exec("insert into private.matrix_analysis_active_versions values('今彩539','115000211','draw','115000211:matrix-python-v16-draw',now())");
 assert.equal(await restore(),false);
 assert.equal(Number(await scalar(db,"select count(*) from private.matrix_analysis_active_versions where lottery='今彩539' and number_order='sorted'")),0);
 await db.exec("delete from private.matrix_analysis_active_versions where lottery='今彩539'; delete from matrix_analysis_artifacts where lottery='今彩539' and analysis_version like '%-draw' and kind='status'");
 assert.equal(await restore(),false);
 assert.equal(Number(await scalar(db,"select count(*) from private.matrix_analysis_active_versions where lottery='今彩539'")),0);
 await db.exec("insert into matrix_analysis_artifacts values('今彩539','115000211','115000211:matrix-python-v15-draw','status')");
 assert.equal(await restore(),true);
 const before=(await db.query("select * from private.matrix_analysis_active_versions where lottery='今彩539' order by number_order")).rows;
 assert.equal(before.length,2);
 assert.equal(await restore(),true);
 assert.deepEqual((await db.query("select * from private.matrix_analysis_active_versions where lottery='今彩539' order by number_order")).rows,before);
 assert.equal((await scalar(db,"select matrix_watchdog_chain_state('今彩539','115000211')")).analysisComplete,true);
});
