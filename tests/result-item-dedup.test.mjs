import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=readFileSync(new URL('../supabase/migrations/20260921003028_result_item_dedup.sql',import.meta.url),'utf8');
const baseline=readFileSync(new URL('./fixtures/result-item-dedup-baseline.sql',import.meta.url),'utf8');
const order='依號碼由小到大排序';
const columns={id:'item_id',ruleCount:'rule_count',consecutive:'consecutive',numberOrder:'number_order',algorithmType:'algorithm_type',highestStreak:'highest_streak',predictionDistance:'prediction_distance',predictionNumbers:'prediction_numbers',lockedSourceIndex:'locked_source_index',lockedSourcePeriod:'locked_source_period',referenceOffset:'reference_offset',referencePosition:'reference_position'};
const sourceItem=(kind,id='a')=>({id,ruleCount:1,consecutive:'準4進5',numberOrder:order,algorithmType:'加減',highestStreak:4,predictionDistance:1,predictionNumbers:['01','02'],lockedSourceIndex:0,lockedSourcePeriod:'41',referenceOffset:null,referencePosition:2,scopeClass:'standard',exploreDateOffset:0,...(kind==='explore'?{number:'03',lockedPosition:1}:{firstNumber:'03',firstLockedPosition:1,secondNumber:'05',secondLockedPosition:2})});
const record=(kind,item,overrides={})=>{
 const map={...columns,...(kind==='explore'?{number:'number',lockedPosition:'locked_position'}:{firstNumber:'first_number',firstLockedPosition:'first_locked_position',secondNumber:'second_number',secondLockedPosition:'second_locked_position'})};
 return {lottery:'今彩539',draw_period:'42',analysis_version:'v1',explore_range:'標準範圍',expires_at:'2099-01-01T00:00:00Z',...Object.fromEntries(Object.entries(map).map(([key,col])=>[col,item[key]??null])),item,validation:{itemId:item.id,sourceA:{sourceNumbers:[1,2,3],referenceNumbers:['01','02']},ruleSets:[{rules:[{value:1}],historicalValidation:[{success:true,sourcePeriod:'20'}]}]},...overrides};
};
const req=kind=>({lottery:'今彩539',drawPeriod:'42',analysisVersion:'v1',numberOrder:order,explorePeriods:kind==='explore'?7:3,exploreDateOffset:0,exploreRange:'標準範圍',ruleCount:1,roadTypes:['加減'],selectedStreaks:['準4進5'],itemId:'a'});
async function database(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;
 create table matrix_analysis_runs(lottery text,draw_period text,analysis_version text,status text,started_at timestamptz,lease_owner text,lease_expires_at timestamptz,primary key(lottery,draw_period,analysis_version));
 insert into matrix_analysis_runs values('今彩539','42','v1','running','2026-09-21','owner','2099-01-01');
 create table matrix_analysis_artifacts(lottery text,draw_period text,analysis_version text,kind text);
 create table private.matrix_worker_completion(lottery text primary key,generation bigint default 0);
 create function private.matrix_analysis_version_readable(text,text,text,text) returns boolean language sql as $$select true$$;
 create function private.matrix_result_entitlements() returns jsonb language sql as $$select '{"canUseSeven":true,"canUseThirteen":true,"canUseFullRange":true}'::jsonb$$;
 create function private.matrix_analysis_read_period(text,text,integer) returns text language sql as $$select $2$$;
 create function private.matrix_analysis_order_version(text,text,text,text) returns text language sql as $$select 'v1'::text$$;`);
 for(const kind of ['explore','tianheng']){
  await db.exec(`create table matrix_${kind}_results(lottery text,draw_period text,analysis_version text,item_id text,
   ${kind==='explore'?'number text,locked_position integer':'first_number text,first_locked_position integer,second_number text,second_locked_position integer'},
   prediction_distance integer,consecutive text,highest_streak integer,prediction_numbers jsonb,algorithm_type text,number_order text,rule_count integer,explore_range text,locked_source_index integer,locked_source_period text,reference_offset integer,reference_position integer,item jsonb not null check(jsonb_typeof(item)='object'),validation jsonb not null,expires_at timestamptz,created_at timestamptz default now(),primary key(lottery,draw_period,analysis_version,item_id));`);
 }
 await db.exec(baseline);
 for(const kind of ['explore','tianheng'])await db.exec(`create trigger completion_update after update on matrix_${kind}_results referencing old table as old_rows new table as new_rows for each statement execute function private.matrix_worker_completion_invalidate();`);
 return db;
}
async function insert(db,kind,r){const keys=Object.keys(r);return db.query(`insert into matrix_${kind}_results(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(k=>typeof r[k]==='object'&&r[k]!==null?JSON.stringify(r[k]):r[k]));}
async function write(db,kind,r,owner='owner'){return (await db.query('select public.matrix_analysis_write_owned($1,$2,$3,$4,$5,$6,$7) ok',['今彩539','42','v1',owner,'2026-09-21',`matrix_${kind}_results`,JSON.stringify([r])])).rows[0].ok;}
const scalar=async(db,sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
for(const kind of ['explore','tianheng']){
 test(`${kind}: list, filters, stats and full validation survive bounded backfill`,async t=>{
  const db=await database();t.after(()=>db.close());const original=sourceItem(kind);
  await insert(db,kind,record(kind,original));await insert(db,kind,record(kind,sourceItem(kind,'b')));
  const responses=[];for(const request of [req(kind),{...req(kind),sameCode:true},{...req(kind),predictionNumber:'01'}])responses.push(await scalar(db,`select private.matrix_${kind}_list_impl($1)`,[JSON.stringify(request)]));
  const validation=await scalar(db,`select private.matrix_${kind}_validation_impl($1)`,[JSON.stringify(req(kind))]);
  await db.exec(migration);await db.exec("insert into private.matrix_worker_completion values('今彩539',10)");
  const changed=await scalar(db,'select private.matrix_result_item_backfill($1,1)',[kind]);assert.equal(changed.rows,1);assert.ok(changed.afterBytes<changed.beforeBytes);
  assert.equal(await scalar(db,'select generation from private.matrix_worker_completion'),10);
  let i=0;for(const request of [req(kind),{...req(kind),sameCode:true},{...req(kind),predictionNumber:'01'}])assert.deepEqual(await scalar(db,`select private.matrix_${kind}_list_impl($1)`,[JSON.stringify(request)]),responses[i++]);
  assert.deepEqual(await scalar(db,`select private.matrix_${kind}_validation_impl($1)`,[JSON.stringify(req(kind))]),validation);
  assert.equal((await scalar(db,'select private.matrix_result_item_backfill($1,100)',[kind])).rows,1);
  assert.equal((await scalar(db,'select private.matrix_result_item_backfill($1,100)',[kind])).rows,0);
  await db.exec(`update matrix_${kind}_results set validation=validation||'{"newDetail":true}'::jsonb where item_id='a'`);
  assert.equal(await scalar(db,'select generation from private.matrix_worker_completion'),11);
 });
 test(`${kind}: missing, null, differently typed and extra item fields remain exact through owned upsert`,async t=>{
  const db=await database();t.after(()=>db.close());await db.exec(migration);
  const first=record(kind,sourceItem(kind));assert.equal(await write(db,kind,first),true);
  const next=structuredClone(first);delete next.item.referenceOffset;next.item.ruleCount='1';next.item.referencePosition=null;next.item.custom={a:[null,'02',2]};
  assert.equal(await write(db,kind,next),true);
  assert.deepEqual(await scalar(db,`select private.matrix_result_item(r) from matrix_${kind}_results r`),next.item);
  assert.equal(await write(db,kind,first,'wrong-owner'),false);
  assert.deepEqual(await scalar(db,`select private.matrix_result_item(r) from matrix_${kind}_results r`),next.item);
 });
 test(`${kind}: completed restoration keeps generation fencing and public item shape`,async t=>{
  const db=await database();t.after(()=>db.close());await db.exec(migration);
  await db.exec(`update matrix_analysis_runs set status='complete';insert into matrix_analysis_artifacts values('今彩539','42','v1','${kind}')`);
  const r=record(kind,sourceItem(kind));const restore=at=>scalar(db,'select public.matrix_analysis_restore_results($1,$2,$3,$4,$5,$6)',['今彩539','42','v1',at,kind,JSON.stringify([r])]);
  assert.equal(await restore('2026-09-20'),false);assert.equal(await restore('2026-09-21'),true);
  assert.deepEqual(await scalar(db,`select private.matrix_result_item(r) from matrix_${kind}_results r`),r.item);
 });
}
test('backfill is not a public RPC',async t=>{
 const db=await database();t.after(()=>db.close());await db.exec(migration);
 for(const role of ['anon','authenticated','service_role'])assert.equal(await scalar(db,"select has_function_privilege($1,'private.matrix_result_item_backfill(text,integer)','execute')",[role]),false);
 await assert.rejects(()=>scalar(db,"select private.matrix_result_item_backfill('other',100)"),/RESULT_BACKFILL_INVALID/);
});

test('migration rejects a concurrently changed predecessor',async t=>{
 const db=await database();t.after(()=>db.close());
 await db.exec("create or replace function private.matrix_explore_list_impl(p_request jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$begin return '{}'::jsonb;end$$");
 await assert.rejects(()=>db.exec(migration),/RESULT_STORAGE_PREDECESSOR_CHANGED/);
});

test('both number orders and arbitrary JSON scalar types roundtrip',async t=>{
 const db=await database();t.after(()=>db.close());await db.exec(migration);
 for(const kind of ['explore','tianheng'])for(const numberOrder of [order,'依實際開獎順序排序'])for(let i=0;i<5;i++){
  const item=sourceItem(kind,numberOrder+i);item.numberOrder=numberOrder;
  const r=record(kind,item);
  if(i===1)delete r.item.referenceOffset;
  if(i===2)r.item.highestStreak='4';
  if(i===3)r.item.referencePosition=null;
  if(i===4)r.item.custom={nested:[null,false,0,'0',{},[]]};
  assert.equal(await write(db,kind,r),true);
  assert.deepEqual(await scalar(db,`select private.matrix_result_item(r) from matrix_${kind}_results r where item_id=$1`,[r.item_id]),r.item);
 }
});
test('privileged direct inserts retain the existing trigger execution contract',async t=>{
 const db=await database();t.after(()=>db.close());await db.exec(migration);
 await db.exec('grant insert on matrix_explore_results to service_role;set role service_role');
 await insert(db,'explore',record('explore',sourceItem('explore')));
 await db.exec('reset role');
 assert.deepEqual(await scalar(db,'select private.matrix_result_item(r) from matrix_explore_results r'),sourceItem('explore'));
});

const indexMigration=readFileSync(new URL('../supabase/migrations/20260921003045_retire_unused_result_prediction_indexes.sql',import.meta.url),'utf8');
test('index retirement keeps unrelated indexes and refuses definition drift',async()=>{
 const db=await database();try {
  for(const kind of ['explore','tianheng'])await db.exec(`create index matrix_${kind}_results_prediction_numbers_idx on matrix_${kind}_results using gin(prediction_numbers);create index matrix_${kind}_results_expiry_idx on matrix_${kind}_results(expires_at);`);
  await db.exec('drop index matrix_explore_results_prediction_numbers_idx;create index matrix_explore_results_prediction_numbers_idx on matrix_explore_results(prediction_distance)');
  await assert.rejects(db.exec(indexMigration),/RESULT_INDEX_RECHECK_REQUIRED/);await db.exec('rollback');
  assert.notEqual(await scalar(db,"select to_regclass('matrix_tianheng_results_prediction_numbers_idx')"),null);
  await db.exec('drop index matrix_explore_results_prediction_numbers_idx;create index matrix_explore_results_prediction_numbers_idx on matrix_explore_results using gin(prediction_numbers)');
  await db.exec(indexMigration);
  for(const kind of ['explore','tianheng']){
   assert.equal(await scalar(db,`select to_regclass('matrix_${kind}_results_prediction_numbers_idx')`),null);
   assert.notEqual(await scalar(db,`select to_regclass('matrix_${kind}_results_expiry_idx')`),null);
  }
 }finally{await db.close();}
});
