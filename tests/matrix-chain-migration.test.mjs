import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
const read = name => readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
// Literal paths keep the scoped-test selector aware of every migration covered here.
const retirement = read('20260920006000_retire_matrix_custom_status.sql');
const functionSql = (sql, name) => sql.match(new RegExp(`create(?: or replace)? function ${name.replaceAll('.', '\\.')}\\([\\s\\S]*?\\$(?:function)?\\$;`, 'i'))[0];
const migrations = [
 read('20260920001000_matrix_chain_evidence.sql'),
 read('20260920002000_matrix_verified_recovery.sql'),
 read('20260920003000_matrix_custom_status_guard.sql'),
 read('20260920004000_matrix_missing_artifact_recovery.sql'),
 read('20260920005000_matrix_optimizer_snapshot.sql'),
];
async function fixture({ retire = true } = {}) {
 const db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema private; create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.members(id uuid primary key default gen_random_uuid(),auth_user_id uuid,status text,is_lifetime boolean,current_plan_id uuid,plan_expires_at timestamptz,line_user_id text,referral_code text,invitation_code text,line_trial_started_at timestamptz,registered_at timestamptz);
 create table public.plans(id uuid,name text);
 create table public.payments(member_id uuid,status text);
 create table private.matrix_permission_settings(singleton boolean,registered_member_free_access boolean,revision int,updated_at timestamptz);
 create function private.member_login_perks_eligible(uuid,text) returns boolean language sql as $$select false$$;
 create table private.line_pwa_handoff_diagnostics(created_at timestamptz);
 create table public.notification_settings(updated_at timestamptz);
 create table public.transfer_requests(submitted_at timestamptz);
 create table public.member_push_subscriptions(enabled boolean,updated_at timestamptz);
 create table public.member_online_sessions(started_at timestamptz,ended_at timestamptz);
 create table public.activation_codes(redeemed_at timestamptz);
 create table public.notification_events(source text,created_at timestamptz);
 create table public.notification_outbox(status text,attempt_count int,updated_at timestamptz,processed_at timestamptz,processing_started_at timestamptz);
 create function auth.role() returns text language sql as $$select 'service_role'::text$$;
 create table public.lottery_draws(lottery text, period text, draw_date date, primary key(lottery,period));
 create table public.matrix_analysis_runs(id uuid default gen_random_uuid() primary key, lottery text,draw_period text,analysis_version text,phase text,cursor int default 0,total int default 0,status text,started_at timestamptz default now(),updated_at timestamptz default now(),completed_at timestamptz,error text,lease_owner text,lease_expires_at timestamptz,unique(lottery,draw_period,analysis_version));
 create table private.matrix_analysis_active_versions(lottery text,draw_period text,number_order text,analysis_version text,activated_at timestamptz,primary key(lottery,draw_period,number_order));
 create table public.matrix_analysis_artifacts(lottery text,draw_period text,analysis_version text,kind text);
 create table public.matrix_custom_status_configs(member_id uuid,lottery text,status text,config jsonb,updated_at timestamptz,primary key(member_id,lottery,status));
 create table public.matrix_custom_status_results(member_id uuid,lottery text,analysis_version text,draw_period text,config_key text,standard_payload jsonb,composite_payload jsonb,updated_at timestamptz,primary key(member_id,lottery));
 create table public.system_job_status(job_name text primary key,lottery text,status text,started_at timestamptz,finished_at timestamptz,updated_at timestamptz,error text,written_period text);
 create function private.matrix_analysis_draw_order_eligible(text,text) returns boolean language sql as $$select $1 <> '天天樂'$$;
 create function private.matrix_analysis_missing_kinds(text,text,text) returns text[] language sql as $$select coalesce(array_agg(k),array[]::text[]) from unnest(array['explore','tianheng','tianyan','tiangong','status']) k where not exists(select 1 from public.matrix_analysis_artifacts a where a.lottery=$1 and a.draw_period=$2 and a.analysis_version=$3 and a.kind=k)$$;`);
 const currentKinds=read('20260919101456_matrix_tianshu.sql').match(/CREATE OR REPLACE FUNCTION private\.matrix_analysis_missing_kinds[\s\S]*?\$function\$;/)[0];
 await db.exec(currentKinds);
 const normalization=read('20260908040432_matrix_custom_status_v2.sql');
 await db.exec(normalization);
 const original=read('20260829093000_matrix_result_rpc.sql');
 for(const name of ['matrix_custom_status_list','matrix_custom_status_reset']) await db.exec(functionSql(original,`public.${name}`));
 await db.exec('alter function public.matrix_custom_status_reset(text,text) rename to matrix_custom_status_reset_20260829_impl');
 await db.exec(functionSql(read('20260914190000_confirmed_member_permission_fixes.sql'),'public.matrix_custom_status_reset'));
 await db.exec(read('20260904103000_add_matrix_watchdog_leases.sql'));
 await db.exec(read('20260916095000_watchdog_active_analysis_state.sql'));
 for(const migration of migrations) await db.exec(migration);
 await db.exec(functionSql(read('20260913171551_admin_service_health_evidence.sql'),'public.admin_service_operation_evidence'));
 await db.exec(read('20260917170500_matrix_status_identity_get.sql'));
 await db.exec(`insert into lottery_draws values ('天天樂','12004','2026-09-19');
 insert into matrix_analysis_runs(lottery,draw_period,analysis_version,status,phase) values('天天樂','12004','12004:matrix-python-v15-sorted','complete','complete');
 insert into private.matrix_analysis_active_versions values('天天樂','12004','sorted','12004:matrix-python-v15-sorted',now());
 insert into matrix_analysis_artifacts select '天天樂','12004','12004:matrix-python-v15-sorted',k from unnest(array['explore','tianheng','tianshu','tianyan','tiangong','status']) k;`);
 await db.exec(`insert into matrix_custom_status_configs(member_id,lottery,status,config) values('11111111-1111-1111-1111-111111111111','天天樂','ACTIVE','{}');
 insert into matrix_custom_status_results(member_id,lottery,draw_period) values('11111111-1111-1111-1111-111111111111','天天樂','stale');
 insert into system_job_status(job_name,retry_count,recovery_count,last_recovery_at) values('preserved-history',7,3,'2026-09-18');
 insert into members(id,registered_at) values('11111111-1111-1111-1111-111111111111','2026-09-18');
 insert into notification_outbox(status,processed_at) values('sent','2026-09-18');
 select claim_matrix_watchdog_lease('unrelated:lease','preserved-owner',1200);`);
 db.sharedBefore = await sharedRows(db);
 if(retire) await db.exec(retirement);
 return db;
}
const scalar=async(db,query,params=[]) => Object.values((await db.query(query,params)).rows[0])[0];
const sharedRows = async db => {
 const tables=['lottery_draws','matrix_analysis_runs','matrix_analysis_artifacts','private.matrix_analysis_active_versions','system_job_status','matrix_watchdog_leases','members','notification_outbox'];
 return Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await db.query(`select * from ${table}`)).rows])));
};
test('retirement removes only custom objects and preserves shared data and API boundaries', async t => {
 const db=await fixture(); t.after(()=>db.close());
 assert.deepEqual(await sharedRows(db),db.sharedBefore);
 await db.exec(readFileSync(new URL('../supabase/tests/matrix-custom-status-retirement.sql',import.meta.url),'utf8'));
 const rights=await scalar(db,'select private.matrix_result_entitlements()');
 assert.deepEqual(Object.keys(rights).sort(),['canUseSeven','canUseThirteen','canUseFullRange','canUseTianyan','canUseTiangong','canViewFullStatus'].sort());
 const evidence=(await db.query('select * from admin_service_operation_evidence()')).rows;
 assert.equal(evidence.length,18);
 assert.equal(evidence.some(row=>row.rpc_name.includes('custom_status')),false);
 assert.equal(new Date(evidence.find(row=>row.rpc_name==='notification_dispatch_mark_sent').observed_at).toISOString(),'2026-09-18T00:00:00.000Z');
});

test('retirement rolls back if an unexpected dependency would be removed', async t => {
 const db=await fixture({retire:false}); t.after(()=>db.close());
 await db.exec('create view public.unexpected_custom_consumer as select lottery from public.matrix_custom_status_configs');
 await assert.rejects(db.exec(retirement),/other objects depend on it/);
 await db.exec('rollback');
 assert.equal(await scalar(db,"select to_regclass('public.matrix_custom_status_configs') is not null"),true);
 assert.equal(await scalar(db,"select to_regprocedure('public.matrix_custom_status_save(jsonb)') is not null"),true);
 assert.deepEqual(await sharedRows(db),db.sharedBefore);
});

test('retirement preserves guest, member, paid and trial entitlement decisions', async t => {
 const db=await fixture(); t.after(()=>db.close());
 const member='11111111-1111-1111-1111-111111111111';
 const oldEntitlement=functionSql(read('20260916015000_google_member_perks.sql'),'private.matrix_result_entitlements');
 const newEntitlement=functionSql(retirement,'private.matrix_result_entitlements');
 const rights=()=>scalar(db,'select private.matrix_result_entitlements()');
 for(const scenario of ['guest','free','registered-access','trial','monthly','quarterly','yearly','lifetime','line-trial']) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[scenario==='guest'?'':member]);
  await db.exec('delete from plans; delete from private.matrix_permission_settings');
  await db.query('insert into private.matrix_permission_settings(singleton,registered_member_free_access) values(true,$1)',[scenario==='registered-access']);
  await db.query('insert into plans values($1,$2)',[member,{'trial':'試用方案','monthly':'月費方案','quarterly':'季費方案','yearly':'年費方案'}[scenario]??'free']);
  await db.query("update members set auth_user_id=id,status='啟用',is_lifetime=$1,current_plan_id=id,plan_expires_at=now()+interval '1 day',line_trial_started_at=case when $2 then now() else null end",[scenario==='lifetime',scenario==='line-trial']);
  await db.exec(oldEntitlement);
  const before=await rights(); delete before.canCustomizeStatus; delete before.canUseCompositeCustomRoad;
  await db.exec(newEntitlement);
  assert.deepEqual(await rights(),before,scenario);
 }
 await db.exec("update members set status='停用'");
 await assert.rejects(rights(),/FORBIDDEN/);
});

test('chain and atomic recovery require general Matrix Status after custom tables are gone', async t => {
 const db=await fixture(); t.after(()=>db.close());
 const chain=()=>scalar(db,"select matrix_watchdog_chain_state('天天樂','12004')");
 const optimization=await scalar(db,'select matrix_optimizer_snapshot()');
 assert.ok(Array.isArray(optimization.indexes));
 assert.ok(Array.isArray(optimization.tables));
 assert.equal(optimization.statements,null);
 assert.equal((await chain()).analysisComplete,true);
 assert.equal((await chain()).matrixStatusComplete,true);
 assert.equal(Object.keys(await chain()).some(key=>key.startsWith('custom')),false);
 assert.equal(await scalar(db,"select claim_matrix_watchdog_lease('railway:天天樂','owner',1200)"),true);
 assert.equal(await scalar(db,"select begin_matrix_watchdog_recovery('railway:天天樂','owner','runner',1200)"),true);
 assert.equal(await scalar(db,"select begin_matrix_watchdog_recovery('railway:天天樂','owner','runner',1200)"),false);
 await db.exec("delete from matrix_analysis_artifacts where kind='status'");
 assert.equal((await chain()).analysisComplete,false);
 assert.equal((await chain()).matrixStatusComplete,false);
 assert.equal(await scalar(db,"select complete_matrix_watchdog_recovery('天天樂','owner','runner','12004')"),false);
 const run=await scalar(db,"select matrix_analysis_acquire_run('天天樂','12004','12004:matrix-python-v15-sorted','runner',now(),300)");
 assert.equal(run.lease_acquired,true); assert.equal(run.phase,'status');
 assert.equal((await scalar(db,"select matrix_analysis_acquire_run('天天樂','12004','12004:matrix-python-v15-sorted','other',now(),300)")).lease_acquired,false);
 await db.exec("insert into matrix_analysis_artifacts values('天天樂','12004','12004:matrix-python-v15-sorted','status'); update matrix_analysis_runs set status='complete'");
 assert.equal(Number(await scalar(db,"select retry_count from system_job_status where job_name='matrix-recovery:天天樂'")),1);
 assert.equal(await scalar(db,"select complete_matrix_watchdog_recovery('天天樂','owner','wrong','12004')"),false);
 assert.equal(await scalar(db,"select complete_matrix_watchdog_recovery('天天樂','owner','runner','12004')"),true);
 assert.equal(await scalar(db,"select complete_matrix_watchdog_recovery('天天樂','owner','runner','12004')"),false);
 assert.equal(Number(await scalar(db,"select recovery_count from system_job_status where job_name='matrix-recovery:天天樂'")),1);
 await db.exec("insert into lottery_draws values('天天樂','12005','2026-09-20'); select claim_matrix_watchdog_lease('railway:天天樂','next',1200); select begin_matrix_watchdog_recovery('railway:天天樂','next','runner2',1200)");
 assert.equal(await scalar(db,"select complete_matrix_watchdog_recovery('天天樂','next','runner2','12004')"),false);
 await db.exec("update matrix_watchdog_leases set expires_at=now()-interval '1 second' where lease_key='railway:天天樂'");
 assert.equal(await scalar(db,"select complete_matrix_watchdog_recovery('天天樂','next','runner2','12005')"),false);
 assert.equal(Number(await scalar(db,"select recovery_count from system_job_status where job_name='matrix-recovery:天天樂'")),1);
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
 assert.equal(Number(await scalar(db,'select recovery_count from system_job_status where job_name=\'matrix-recovery:天天樂\'')),0);
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
