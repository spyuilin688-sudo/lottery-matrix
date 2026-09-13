import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../migrations/20260913031818_matrix_analysis_retention_v2.sql');
const db = new PGlite();
const sorted = '依號碼由小到大排序', actual = '依實際開獎順序排序';
const kinds = ['explore','tianheng','tianyan','tiangong','status'];
const relations = {explore:'matrix_explore_results',tianheng:'matrix_tianheng_results',artifacts:'matrix_analysis_artifacts',chunks:'matrix_analysis_artifact_chunks'};
const unwrapped = sql => sql.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema private; create schema auth; create schema storage;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    select set_config('request.jwt.claim.role','service_role',false);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create function private.matrix_result_entitlements() returns jsonb language sql stable as $$
      select '{"canUseSeven":true,"canUseThirteen":true,"canUseFullRange":true,"canUseTianyan":true,"canUseTiangong":true,"canViewFullStatus":true}'::jsonb $$;
    -- PGlite cannot load the background-worker extension. This catalog fixture
    -- tests the migration's scheduling arguments, not a real cron execution.
    create schema cron; create table cron.job(jobid bigint generated always as identity primary key,jobname text,schedule text,command text,active boolean default true);
    create function cron.schedule(text,text,text) returns bigint language plpgsql as $$ declare job bigint; begin
      insert into cron.job(jobname,schedule,command) values ($1,$2,$3) returning jobid into job; return job; end $$;
    create function cron.unschedule(bigint) returns boolean language plpgsql as $$ begin delete from cron.job where jobid=$1; return found; end $$;
    select cron.schedule('matrix-visitor-retention','* * * * *','select 1');`);
  await db.exec(read('./fixtures/matrix-analysis-tables.sql'));
  for (const file of ['20260825060000_matrix_analysis_artifact_chunks.sql','20260903185906_matrix_analysis_run_lease.sql',
    '20260905122413_create_static_matrix_card_publication.sql','20260905141003_repair_matrix_analysis_retention_and_recovery.sql']) await db.exec(read(`../migrations/${file}`));
  await db.exec('alter table public.lottery_draws drop column result_status');
  for (const file of ['20260912164917_two_stage_lottery_results.sql','20260912164938_matrix_order_analysis_reads.sql',
    '20260912192941_preserve_provisional_draw_identity.sql','20260912192953_matrix_analysis_owned_writes.sql',
    '20260912193421_matrix_analysis_seal_direct_writes.sql','20260912202503_avoid_unchanged_draw_writes.sql',
    '20260912230514_matrix_analysis_active_versions.sql']) await db.exec(read(`../migrations/${file}`));
  await db.exec(migration);
});
after(async () => db.close());
beforeEach(async () => db.exec('reset role; begin; truncate public.lottery_draws, public.matrix_analysis_runs cascade;'));
afterEach(async () => db.exec('rollback'));
const scalar = async (sql,args=[]) => Object.values((await db.query(sql,args)).rows[0])[0];
async function seed({p='103',l='今彩539',date='2026-09-12',stage='v15-sorted',status='complete',pointer=true,ttl='-1 day',draw=false,rows=1}={}) {
  const version = `${p}:matrix-python-${stage}`;
  await db.query(`insert into public.lottery_draws(lottery,period,draw_date,numbers,sorted_numbers,draw_order_numbers,result_status)
    select $1,$2,$3::date,'[1,2,3,4,5]','[1,2,3,4,5]',$4::jsonb,'confirmed'
    where not exists (select 1 from public.lottery_draws where lottery=$1 and period=$2)`,[l,p,date,draw?'[5,4,3,2,1]':null]);
  await db.query(`insert into public.matrix_analysis_runs(lottery,draw_period,analysis_version,phase,status,started_at,completed_at,lease_owner,lease_expires_at)
    values ($1,$2,$3,'status',$4,now()-interval '2 days',now(),case when $4='running' then 'worker' end,now()+interval '1 hour')`,[l,p,version,status]);
  const orders = stage.endsWith('-draw') ? [actual] : stage.endsWith('-sorted') ? [sorted] : [sorted,actual];
  for (const kind of kinds) {
    const items = orders.map(numberOrder=>({id:`${stage}-${numberOrder}`,numberOrder}));
    const payload = kind === 'status' ? {summary:{marker:stage},statusSources:{explore:{items},tianyan:{items}}} : {items:[]};
    await db.query(`insert into public.matrix_analysis_artifacts(lottery,draw_period,analysis_version,kind,payload,completed_at,expires_at)
      values ($1,$2,$3,$4,$5,now(),now()+$6::interval)`,[l,p,version,kind,JSON.stringify(payload),ttl]);
  }
  await db.query(`insert into public.matrix_explore_results(lottery,draw_period,analysis_version,item_id,number_order,item,validation,
    number,locked_position,prediction_distance,consecutive,highest_streak,prediction_numbers,algorithm_type,rule_count,locked_source_index,locked_source_period,expires_at)
    select $1,$2,$3,'item-'||i,$4,'{}','{}','01',1,1,'連2',2,'[7]','加減',1,0,$2,now()+$5::interval from generate_series(1,$6::int) i`,[l,p,version,orders[0],ttl,rows]);
  await db.query(`insert into public.matrix_tianheng_results(lottery,draw_period,analysis_version,item_id,number_order,item,validation,
    first_number,first_locked_position,second_number,second_locked_position,prediction_distance,consecutive,highest_streak,prediction_numbers,algorithm_type,rule_count,explore_range,locked_source_index,locked_source_period,expires_at)
    select $1,$2,$3,'item-'||i,$4,'{}','{}','01',1,'02',2,1,'連2',2,'[7]','加減',1,'標準範圍',0,$2,now()+$5::interval from generate_series(1,$6::int) i`,[l,p,version,orders[0],ttl,rows]);
  await db.query(`insert into public.matrix_analysis_artifact_chunks(lottery,draw_period,analysis_version,kind,chunk_index,cursor_start,cursor_end,payload,expires_at)
    select $1,$2,$3,'explore',i,i,i+1,'{}',now()+$4::interval from generate_series(0,$5::int-1) i`,[l,p,version,ttl,rows]);
  if (pointer) for (const order of orders.filter(order=>order===sorted || draw && l!=='天天樂')) {
    await db.query(`insert into private.matrix_analysis_active_versions(lottery,draw_period,number_order,analysis_version)
      values ($1,$2,$3,$4) on conflict (lottery,draw_period,number_order) do update set analysis_version=excluded.analysis_version`,[l,p,order===sorted?'sorted':'draw',version]);
  }
  return version;
}
async function enable() { await db.exec("update private.matrix_maintenance_status set cleanup_enabled=true where job_name='analysis-retention'"); }
async function cleanup(batch=5000,now='clock_timestamp()') { return scalar(`select private.matrix_analysis_cleanup_batch(${now},$1)`,[batch]); }
async function preview() { return Object.fromEntries((await db.query('select * from private.matrix_analysis_cleanup_preview()')).rows.map(r=>[r.table_name,r])); }
async function counts() { const result={}; for (const [name,table] of Object.entries(relations)) result[name]=Number(await scalar(`select count(*) from public.${table}`)); return result; }
async function recent() { for (let i=1;i<=3;i++) await seed({p:`10${i}`,date:`2026-09-${9+i}`}); }

test('migration keeps cleanup gated and installs exactly one hourly private tick',async()=>{
  await seed({pointer:false,status:'failed'}); const before=await counts();
  assert.equal(await scalar('select public.matrix_analysis_cleanup_expired(clock_timestamp())'),0);
  assert.equal(await scalar('select private.matrix_analysis_cleanup_tick()'),0);
  assert.deepEqual(await counts(),before);
  const jobs=(await db.query("select jobname,schedule,command from cron.job order by jobname")).rows;
  assert.deepEqual(jobs,[{jobname:'matrix-analysis-retention',schedule:'17 * * * *',command:'select private.matrix_analysis_cleanup_tick();'},
    {jobname:'matrix-visitor-retention',schedule:'* * * * *',command:'select 1'}]);
});
test('expired recent three active versions and running versions survive while expired superseded versions are deleted',async()=>{
  await recent(); await seed({stage:'v14-sorted',pointer:false}); await seed({stage:'v16-sorted',status:'running',pointer:false});
  const before=await preview(); assert.equal(Number(before.artifacts.expired_deletable),5);
  assert.equal(Number(before.explore.expired_retained),4); assert.equal(Number(before.explore.superseded_rows),2);
  await enable(); assert.equal(await cleanup(),8);
  assert.deepEqual(await counts(),{explore:4,tianheng:4,artifacts:20,chunks:4});
  assert.equal(Number(await scalar('select count(*) from public.matrix_analysis_runs')),5);
});
test('superseded live TTL rows survive even with a future supplied cleanup time',async()=>{
  await recent(); await seed({stage:'v14-sorted',pointer:false,ttl:'1 day'}); await enable();
  assert.equal(await cleanup(5000,"clock_timestamp()+interval '10 years'"),0);
  assert.equal(Number((await preview()).explore.expired_deletable),0);
});
test('independent sorted and draw pointers are never counted as duplicates or deletable',async()=>{
  await seed({draw:true}); await seed({draw:true,stage:'v15-draw'}); await enable();
  const rows=await preview(); for (const value of Object.values(rows)) { assert.equal(Number(value.expired_deletable),0); assert.equal(Number(value.superseded_rows),0); }
  assert.equal(await cleanup(),0); assert.equal(Number(await scalar('select count(*) from private.matrix_analysis_retained_versions()')),2);
});
test('天天樂 requires only sorted and legacy v12 is resolved through the manifest',async()=>{
  const version=await seed({l:'天天樂',stage:'v12'}); await enable(); assert.equal(await cleanup(),0);
  assert.equal(await scalar('select private.matrix_analysis_order_version($1,$2,$3,$4)',['天天樂','103',sorted,'explore']),version);
  assert.equal(await scalar('select private.matrix_analysis_order_version($1,$2,$3,$4)',['天天樂','103',actual,'explore']),null);
});
test('legacy shared version is superseded only when neither active order references it',async()=>{
  await seed({stage:'v12',draw:true}); await seed({draw:true});
  assert.equal(Number((await preview()).artifacts.superseded_rows),0);
  await seed({stage:'v15-draw',draw:true}); assert.equal(Number((await preview()).artifacts.superseded_rows),5);
});
test('status composes both active sources and its validation identity changes with either source',async()=>{
  await seed({draw:true}); await seed({draw:true,stage:'v15-draw'});
  const get=()=>scalar("select private.matrix_status_read_payload('今彩539','103')");
  const first=await get();
  for (const kind of ['explore','tianyan']) assert.deepEqual(first.payload.statusSources[kind].items.map(i=>i.numberOrder),[sorted,actual]);
  await seed({draw:true,stage:'v16-draw'}); const second=await get(); assert.notEqual(second.analysisVersion,first.analysisVersion);
  await seed({draw:true,stage:'v16-sorted'}); const third=await get(); assert.notEqual(third.analysisVersion,second.analysisVersion);
  assert.equal((await get()).analysisVersion,third.analysisVersion);
  await assert.rejects(scalar('select public.matrix_status_validation_source_get($1)',[JSON.stringify({lottery:'今彩539',drawPeriod:'103',analysisVersion:first.analysisVersion,itemId:'irrelevant'})]),/ANALYSIS_VERSION_MISMATCH|ANALYSIS_STALE/);
});
test('batch bounds each result table independently and retires an old pointer atomically',async()=>{
  await seed({p:'100',date:'2026-09-01',rows:5001}); await recent(); await enable();
  assert.equal(await cleanup(),12005);
  assert.deepEqual(await counts(),{explore:4,tianheng:4,artifacts:15,chunks:3004});
  assert.equal(Number(await scalar("select count(*) from private.matrix_analysis_active_versions where draw_period='100'")),0);
  assert.equal(Number(await scalar('select count(*) from public.matrix_analysis_runs')),4);
});
test('small batch and artifact cap preserve children with live TTL without cascades',async()=>{
  await seed({p:'100',date:'2026-09-01',rows:8}); await recent();
  await db.exec("update public.matrix_analysis_artifact_chunks set expires_at=clock_timestamp()+interval '1 day' where draw_period='100'");
  await enable(); assert.equal(await cleanup(2),6);
  assert.deepEqual(await counts(),{explore:9,tianheng:9,artifacts:18,chunks:11});
  assert.equal(Number(await scalar("select count(*) from public.matrix_analysis_artifact_chunks where draw_period='100'")),8);
});
test('missing required manifest fails closed and records an error without advancing success freshness',async()=>{
  await recent(); await seed({stage:'v14-sorted',pointer:false});
  await db.exec("delete from private.matrix_analysis_active_versions where draw_period='102'"); await enable();
  const before=await counts(); assert.equal(await cleanup(),0); assert.deepEqual(await counts(),before);
  const status=await scalar('select public.matrix_analysis_cleanup_status()');
  assert.match(status.last_error,/MATRIX_ACTIVE_VERSION_UNHEALTHY/); assert.equal(status.last_finished_at,null); assert.equal(status.cleanup_due,true);
  assert.equal((await scalar('select public.matrix_analysis_storage_health()')).status,'Critical');
});
test('result errors roll back all deletions but persist maintenance error and retry remains due',async()=>{
  await recent(); await seed({stage:'v14-sorted',pointer:false}); await enable();
  await db.exec(`create function pg_temp.reject_delete() returns trigger language plpgsql as $$ begin raise exception 'TEST_DELETE_FAILURE'; end $$;
    create trigger reject_cleanup before delete on public.matrix_tianheng_results for each row execute function pg_temp.reject_delete();`);
  const before=await counts(); assert.equal(await cleanup(),0); assert.deepEqual(await counts(),before);
  const status=await scalar('select public.matrix_analysis_cleanup_status()'); assert.match(status.last_error,/TEST_DELETE_FAILURE/);
  assert.equal(status.last_deleted,0); assert.equal(status.last_finished_at,null); assert.equal(status.cleanup_due,true);
  assert.equal(status.deletable_backlog,8);
});
test('successful cleanup updates backlog and two-hour fallback freshness without large-table reads in status',async()=>{
  await recent(); await seed({stage:'v14-sorted',pointer:false,rows:4}); await enable();
  assert.equal(await cleanup(2),8); let status=await scalar('select public.matrix_analysis_cleanup_status()');
  assert.equal(status.cleanup_due,false); assert.equal(status.last_deleted,8); assert.equal(status.deletable_backlog,9); assert.equal(status.last_error,null);
  await db.exec("update private.matrix_maintenance_status set last_finished_at=clock_timestamp()-interval '2 hours'");
  status=await scalar('select public.matrix_analysis_cleanup_status()'); assert.equal(status.cleanup_due,true);
});
test('health uses actual bytes and status severity rather than guessed capacity',async()=>{
  await recent(); let health=await scalar('select public.matrix_analysis_storage_health()'); assert.equal(health.status,'Warning');
  assert.equal(health.active_versions,3); assert.equal(health.active_unhealthy,0); assert.ok(health.database_size_bytes>0);
  for (const key of Object.keys(relations)) assert.ok(health.tables[key].size_bytes>=0);
  await enable(); await cleanup(); health=await scalar('select public.matrix_analysis_storage_health()'); assert.equal(health.status,'Healthy');
  assert.equal(health.cleanup.job_name,'analysis-retention'); assert.equal(health.expired_deletable_rows,0);
});
test('health exposes a damaged historical pointer until bounded cleanup retires it',async()=>{
  await seed({p:'100',date:'2026-09-01'}); await recent();
  await db.exec("delete from public.matrix_analysis_artifacts where draw_period='100' and kind='status'");
  const unhealthy=await scalar('select public.matrix_analysis_storage_health()');
  assert.equal(unhealthy.active_unhealthy,1); assert.equal(unhealthy.status,'Critical');
  await enable(); assert.equal(await cleanup(),7);
  const healthy=await scalar('select public.matrix_analysis_storage_health()');
  assert.equal(healthy.active_unhealthy,0); assert.equal(healthy.status,'Healthy');
});
test('only service role gets public monitoring and cleanup; private data and helpers stay inaccessible',async()=>{
  for (const role of ['anon','authenticated','service_role']) {
    assert.equal(await scalar("select has_table_privilege($1,'private.matrix_maintenance_status','SELECT,INSERT,UPDATE,DELETE')",[role]),false);
    for (const fn of ['private.matrix_analysis_cleanup_batch(timestamptz,integer)','private.matrix_analysis_cleanup_preview()',
      'private.matrix_analysis_retained_versions()','private.matrix_analysis_cleanup_tick()'])
      assert.equal(await scalar('select has_function_privilege($1,$2,\'EXECUTE\')',[role,fn]),false);
    for (const fn of ['public.matrix_analysis_cleanup_expired(timestamptz)','public.matrix_analysis_cleanup_status()','public.matrix_analysis_storage_health()'])
      assert.equal(await scalar('select has_function_privilege($1,$2,\'EXECUTE\')',[role,fn]),role==='service_role');
  }
});
test('artifact rows stay capped at 500 even when a caller requests an oversized batch',async()=>{
  for (let i=0;i<101;i++) await seed({stage:`v${100+i}-sorted`,status:'failed',pointer:false});
  await enable(); assert.equal(await cleanup(100000),803);
  assert.deepEqual(await counts(),{explore:0,tianheng:0,chunks:0,artifacts:5});
  assert.equal(Number(await scalar('select count(*) from public.matrix_analysis_runs')),101);
});
test('repeatable-read invocation fails closed because post-lock freshness is unavailable',async()=>{
  await db.exec('rollback; begin isolation level repeatable read');
  await recent(); await seed({stage:'v14-sorted',pointer:false}); await enable(); const before=await counts();
  assert.equal(await cleanup(),0); assert.deepEqual(await counts(),before);
  assert.match((await scalar('select public.matrix_analysis_cleanup_status()')).last_error,/CLEANUP_REQUIRES_READ_COMMITTED/);
});
test('null cutoff and invalid batch size cannot delete rows and failed attempts do not refresh success',async()=>{
  await recent(); await seed({stage:'v14-sorted',pointer:false}); await enable(); const before=await counts();
  assert.equal(await cleanup(5000,'null'),0);
  assert.match((await scalar('select public.matrix_analysis_cleanup_status()')).last_error,/CLEANUP_TIME_REQUIRED/);
  assert.equal(await cleanup(0),0);
  assert.match((await scalar('select public.matrix_analysis_cleanup_status()')).last_error,/CLEANUP_BATCH_SIZE_INVALID/);
  assert.deepEqual(await counts(),before);
});
test('scheduler reconciliation removes only its exact-name duplicates',async()=>{
  await db.exec("select cron.schedule('matrix-analysis-retention','* * * * *','select 2'); select cron.schedule('matrix-analysis-retention','* * * * *','select 3');");
  const scheduling=migration.slice(migration.indexOf('-- Replace only this exact job name'));
  await db.exec(unwrapped(scheduling));
  assert.equal(Number(await scalar("select count(*) from cron.job where jobname='matrix-analysis-retention'")),1);
  assert.equal(await scalar("select schedule from cron.job where jobname='matrix-visitor-retention'"),'* * * * *');
});
