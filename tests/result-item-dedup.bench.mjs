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

const db=await database();
try {
 const r=Array.from({length:1000},(_,i)=>record('explore',sourceItem('explore','item'+i)));
 const ks=Object.keys(r[0]);
 await db.query(`insert into matrix_explore_results(${ks.join(',')}) select ${ks.join(',')} from jsonb_populate_recordset(null::matrix_explore_results,$1)`,[JSON.stringify(r)]);
 const measure=async()=>{const times=[];let payload;for(let i=0;i<12;i++){const start=performance.now();payload=await scalar(db,'select private.matrix_explore_list_impl($1)',[JSON.stringify(req('explore'))]);times.push(Math.round((performance.now()-start)*100)/100);}return {times,payload};};
 const before=await measure();await db.exec(migration);await scalar(db,"select private.matrix_result_item_backfill('explore',1000)");const after=await measure();
 assert.deepEqual(after.payload,before.payload);console.log(JSON.stringify({rows:1000,beforeMs:before.times,afterMs:after.times,equivalent:true}));
}finally{await db.close();}
