import assert from 'node:assert/strict';
import { after,test } from 'node:test';
import { createAppMatrixDb,matrixKinds } from './helpers/app-matrix-db.mjs';
import { applyAppMigrations,identity,asUser,rpc,pwaSnapshot } from './helpers/app-db.mjs';

const db = await createAppMatrixDb();
after(()=>db.close());
const order='依號碼由小到大排序',period='115000220',version=period+':matrix-python-v15-sorted';
const paid = await identity(db), app = await identity(db);
await asUser(db,paid,()=>rpc(db,'member_bootstrap'));
await db.query('update members set is_lifetime=true where auth_user_id=$1',[paid.user]);
await db.query("insert into lottery_draws(lottery,period,draw_date,numbers,sorted_numbers,draw_order_numbers) values('今彩539',$1,'2026-09-26','[1,2,3,4,5]','[1,2,3,4,5]','[1,2,3,4,5]')",[period]);
await db.query("insert into matrix_analysis_runs(lottery,draw_period,analysis_version,phase,status,started_at,completed_at) values('今彩539',$1,$2,'complete','complete',now(),now())",[period,version]);
await db.query("insert into private.matrix_analysis_active_versions values('今彩539',$1,'sorted',$2)",[period,version]);
for(const kind of [...matrixKinds,'status']) await db.query("insert into matrix_analysis_artifacts(lottery,draw_period,analysis_version,kind,payload,completed_at,expires_at) values('今彩539',$1,$2,$3,$4,now(),now()+interval '1 day')",[period,version,kind,{lottery:'今彩539',drawPeriod:period,numberOrder:order,items:[],validationById:{}}]);
for(const kind of ['explore','tianheng','tianshu']) {
  const row={lottery:'今彩539',draw_period:period,analysis_version:version,item_id:'a',prediction_distance:1,consecutive:'準4進5',highest_streak:4,prediction_numbers:['01'],algorithm_type:'加減',number_order:order,rule_count:1,explore_range:'標準範圍',locked_source_index:0,locked_source_period:period,reference_offset:null,reference_position:1,
    item:{id:'a',numberOrder:order,scopeClass:'standard',predictionNumbers:['01'],lockedSourceIndex:0,highestStreak:4,predictionDistance:1},validation:{itemId:'a',rules:[{value:1}]},expires_at:'2099-01-01',
    ...(kind==='explore'?{number:'03',locked_position:1}:{first_number:'03',first_locked_position:1,second_number:'05',second_locked_position:2}),
    ...(kind==='tianshu'?{third_number:'07',third_locked_position:3}:{})};
  const keys=Object.keys(row);
  await db.query(`insert into matrix_${kind}_results(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(key=>typeof row[key]==='object'&&row[key]!==null?JSON.stringify(row[key]):row[key]));
}
for(const kind of ['tianyan','tiangong']) {
  const item=kind==='tianyan'
    ? {id:'a',number:'01',ruleIds:['a1','a2'],roadType:'複合',consecutive:'準4進5',numberOrder:order,hitCondition:'準4+',highestStreak:4,explorePeriods:13,lockedPosition:1,exploreDateOffset:0,lockedSourceIndex:0,predictionNumbers:['01'],lockedSourcePeriod:period,predictionDistance:1}
    : {id:'a',numberOrder:order,interval:1,firstRoadType:'加減',secondRoadType:'合值',exploreDirection:'固定',predictionNumber:'01',predictedPosition:1,eligiblePeriodRange:50,firstStageDirection:'固定',secondStageDirection:'固定'};
  const validation={itemId:'a',rules:[{id:'a1',algorithmType:'加減',referenceOffset:-2,validationPeriodOffset:-2},{id:'a2',algorithmType:'合值',referenceOffset:-2,validationPeriodOffset:-2}]};
  await db.query('update matrix_analysis_artifacts set payload=$1 where kind=$2',[{lottery:'今彩539',drawPeriod:period,numberOrder:order,items:[item],validationById:{a:validation}},kind]);
}
const request = kind => kind==='tiangong'
  ? {lottery:'今彩539',drawPeriod:period,periodRange:50,mode:'two-stage',exploreDirections:['固定'],firstStageDirections:['固定'],firstRoadTypes:['加減'],secondStageDirections:['固定'],secondRoadTypes:['合值']}
  : {lottery:'今彩539',drawPeriod:period,numberOrder:order,explorePeriods:13,exploreDateOffset:0,exploreRange:'完整範圍',ruleCount:1,roadTypes:['加減'],selectedStreaks:['準4進5']};
const baseline = {};
const validationRequest=kind=>({...request(kind),analysisVersion:version,itemId:'a'});
const validations={};
for (const kind of matrixKinds) {
  baseline[kind] = await asUser(db,paid,()=>rpc(db,`matrix_${kind}_list`,[request(kind)]));
  assert.equal(baseline[kind].items.length,1,`${kind} seeded result must be selected`);
  validations[kind]=await asUser(db,paid,()=>rpc(db,`matrix_${kind}_validation`,[validationRequest(kind)]));
}
await applyAppMigrations(db,['app_matrix_read_api']);

for(const kind of matrixKinds) test(`${kind} App payload equals authorized PWA payload without changing PWA membership`,async()=>{
  const before=await pwaSnapshot(db);
  await asUser(db,app,()=>rpc(db,'app_member_bootstrap'));
  const value=await asUser(db,app,()=>rpc(db,`app_matrix_${kind}_list`,[request(kind)]));
  assert.deepEqual(value,baseline[kind]);
  assert.deepEqual(await asUser(db,app,()=>rpc(db,`app_matrix_${kind}_validation`,[validationRequest(kind)])),validations[kind]);
  assert.deepEqual(await asUser(db,paid,()=>rpc(db,`matrix_${kind}_validation`,[validationRequest(kind)])),validations[kind]);
  assert.deepEqual(await asUser(db,paid,()=>rpc(db,`matrix_${kind}_list`,[request(kind)])),baseline[kind]);
  assert.deepEqual(await pwaSnapshot(db),before);
});

test('anonymous access keeps only basic reads and cannot supply its own entitlements',async()=>{
  await db.exec('set role anon');
  try {
    const basic={...request('explore'),explorePeriods:2,exploreRange:'標準範圍'};
    assert.deepEqual(await rpc(db,'app_matrix_explore_list',[basic]),await rpc(db,'matrix_explore_list',[basic]));
    assert.ok(Object.values(await rpc(db,'app_matrix_entitlements')).every(v=>v===false));
    await assert.rejects(rpc(db,'app_matrix_tiangong_list',[{...request('tiangong'),platform:'app',canUseTiangong:true}]),/FORBIDDEN/);
  }finally{await db.exec('reset role');}
});

test('joining App never upgrades PWA free or expired entitlement',async()=>{
  for(const expired of [false,true]){
    const actor=await identity(db);
    await asUser(db,actor,()=>rpc(db,'member_bootstrap'));
    await db.query("update members set line_trial_started_at=now()-interval '5 days',plan_expires_at=now()-interval '1 day' where auth_user_id=$1",[actor.user]);
    if(expired) await db.query("with plan as(insert into plans(name,price) values('年費方案',100) returning id) update members set current_plan_id=plan.id from plan where auth_user_id=$1",[actor.user]);
    await assert.rejects(asUser(db,actor,()=>rpc(db,'matrix_tiangong_list',[request('tiangong')])),/FORBIDDEN/);
    await asUser(db,actor,()=>rpc(db,'app_member_bootstrap'));
    await assert.rejects(asUser(db,actor,()=>rpc(db,'matrix_tiangong_list',[request('tiangong')])),/FORBIDDEN/);
  }
});

test('cached data does not bypass App disable, forged flags, member ID or session revocation',async()=>{
  const actor=await identity(db);
  await asUser(db,actor,()=>rpc(db,'app_member_bootstrap'));
  await asUser(db,actor,()=>rpc(db,'app_matrix_tiangong_list',[request('tiangong')]));
  await db.query("update app_members set status='disabled' where auth_user_id=$1",[actor.user]);
  await assert.rejects(asUser(db,actor,()=>rpc(db,'app_matrix_tiangong_list',[{...request('tiangong'),platform:'app',memberId:app.user,entitlements:{canUseTiangong:true}}])),/FORBIDDEN/);
  await assert.rejects(asUser(db,actor,()=>db.exec("select private.matrix_tiangong_list_core('{}','{\"canUseTiangong\":true}')")),e=>e.code==='42501');
});

test('wrong draw and validation version are rejected across both products',async()=>{
  for(const prefix of ['','app_']) {
    const actor=prefix?app:paid;
    await assert.rejects(asUser(db,actor,()=>rpc(db,`${prefix}matrix_tiangong_list`,[{...request('tiangong'),drawPeriod:'999999999'}])),/ANALYSIS_NOT_READY/);
    await assert.rejects(asUser(db,actor,()=>rpc(db,`${prefix}matrix_tiangong_validation`,[{...request('tiangong'),analysisVersion:'wrong',itemId:'absent'}])),/ANALYSIS_VERSION_MISMATCH|ANALYSIS_NOT_FOUND/);
  }
});

test('an empty entitlement table cannot skip the App membership check',async()=>{
  const actor=await identity(db);
  await db.exec('delete from app_entitlements;');
  await assert.rejects(asUser(db,actor,()=>rpc(db,'app_matrix_entitlements')),/FORBIDDEN/);
});
