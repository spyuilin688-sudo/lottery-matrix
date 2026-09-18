import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const lottery = '今彩539';
const sorted = '依號碼由小到大排序';
const actual = '依實際開獎順序排序';
const current = '115000222';
const previous = '115000221';
const version = (period, stage) => `${period}:matrix-python-${stage === 'legacy' ? 'v13' : `v14-${stage}`}`;
const db = new PGlite();

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private;
    create function private.matrix_result_entitlements() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('test.entitlements', true), '')::jsonb,
        '{"canUseSeven":true,"canUseThirteen":true,"canUseFullRange":true,"canUseTianyan":true,"canUseTiangong":true,"canViewFullStatus":true}'::jsonb)
    $$;`);
  await db.exec(read('./fixtures/matrix-analysis-tables.sql'));
  await db.exec(read('../migrations/20260825060000_matrix_analysis_artifact_chunks.sql'));
  // An optional SQL file permits replaying these regressions against a prior deployment.
  const migration = process.env.MATRIX_READS_MIGRATION
    ? readFileSync(process.env.MATRIX_READS_MIGRATION, 'utf8')
    : read('../migrations/20260912164938_matrix_order_analysis_reads.sql');
  await db.exec(migration);
});
after(async () => db.close());
beforeEach(async () => {
  await db.exec(`truncate public.lottery_draws, public.matrix_analysis_runs cascade;
    select set_config('test.entitlements', '', false);`);
  await draw(previous, '2026-09-11');
  await draw(current, '2026-09-12', 'preliminary');
});

async function draw(period, date, status = 'confirmed', order = [5, 4, 3, 2, 1]) {
  await db.query(`insert into public.lottery_draws(lottery,period,draw_date,numbers,sorted_numbers,draw_order_numbers,result_status)
    values ($1,$2,$3,'[1,2,3,4,5]','[1,2,3,4,5]',$4,$5)`,
  [lottery, period, date, status === 'preliminary' || order == null ? null : JSON.stringify(order), status]);
}
async function confirm(order = [5, 4, 3, 2, 1]) {
  await db.query('update public.lottery_draws set result_status=$1, draw_order_numbers=$2 where period=$3',
    ['confirmed', order == null ? null : JSON.stringify(order), current]);
}
function item(id, order) {
  return { id, number:'01', lockedPosition:1, firstLockedPosition:1, secondLockedPosition:2,
    predictionDistance:1, consecutive:'連2', highestStreak:2, predictionNumbers:['07'],
    algorithmType:'加減', numberOrder:order, lockedSourceIndex:0, explorePeriods:13,
    exploreDateOffset:0, ruleCount:1 };
}
async function run(period, stage, status = 'complete', { omitKind, dirtyOrder = false } = {}) {
  const v = version(period, stage);
  await db.query(`insert into public.matrix_analysis_runs(lottery,draw_period,analysis_version,phase,status,started_at,completed_at)
    values ($1,$2,$3,'complete',$4,now(),now())`, [lottery, period, v, status]);
  const orders = stage === 'legacy' || dirtyOrder ? [sorted, actual] : [stage === 'draw' ? actual : sorted];
  const rows = orders.map(order => item(`${stage}-${order === sorted ? 's' : 'a'}`, order));
  const validations = Object.fromEntries(rows.map(row => [row.id, {
    marker: `${period}-${row.id}`, rules: [
      { algorithmType:'加減', referenceOffset:0 }, { algorithmType:'加減', referenceOffset:0 },
    ],
  }]));
  const artifact = {lottery, drawPeriod:period, items:rows, validationById:validations};
  const tiangong = {lottery, drawPeriod:period, numberOrder: sorted, items:stage === 'draw' ? [] : [{
    id:`${stage}-gong`, eligiblePeriodRange:50, predictedPosition:1, predictionNumber:'07', interval:1,
    exploreDirection:'forward', firstStageDirection:'forward', firstRoadType:'加減',
    secondStageDirection:'forward', secondRoadType:'加減',
  }], validationById:{[`${stage}-gong`]:{marker:'sorted-gong'}}};
  for (const kind of ['explore', 'tianheng', 'tianyan', 'tiangong', 'status']) {
    if (kind === omitKind) continue;
    const payload = kind === 'status' ? {
      lottery, drawPeriod:period, summary:{status:'ACTIVE', marker:stage}, counts:{ACTIVE:1}, cards:[],
      statusSources:{ explore:artifact, tianyan:artifact },
    } : kind === 'tiangong' ? tiangong : artifact;
    await db.query(`insert into public.matrix_analysis_artifacts(lottery,draw_period,analysis_version,kind,payload,completed_at,expires_at)
      values ($1,$2,$3,$4,$5,now(),now()+interval '1 day')`, [lottery,period,v,kind,JSON.stringify(payload)]);
  }
  for (const row of rows) {
    const common = [lottery,period,v,row.id,row.numberOrder,JSON.stringify(row),JSON.stringify(validations[row.id])];
    await db.query(`insert into public.matrix_explore_results(lottery,draw_period,analysis_version,item_id,number_order,item,validation,
      number,locked_position,prediction_distance,consecutive,highest_streak,prediction_numbers,algorithm_type,rule_count,locked_source_index,locked_source_period,expires_at)
      values ($1,$2,$3,$4,$5,$6,$7,'01',1,1,'連2',2,'["07"]','加減',1,0,$2,now()+interval '1 day')`, common);
    await db.query(`insert into public.matrix_tianheng_results(lottery,draw_period,analysis_version,item_id,number_order,item,validation,
      first_number,first_locked_position,second_number,second_locked_position,prediction_distance,consecutive,highest_streak,prediction_numbers,algorithm_type,rule_count,explore_range,locked_source_index,locked_source_period,expires_at)
      values ($1,$2,$3,$4,$5,$6,$7,'01',1,'02',2,1,'連2',2,'["07"]','加減',1,'標準範圍',0,$2,now()+interval '1 day')`, common);
  }
  return v;
}
async function rpc(name, request = {}) {
  const schema = name.startsWith('matrix_status_') ? 'public' : 'private';
  const result = await db.query(`select ${schema}.${name}($1::jsonb) as result`, [JSON.stringify({lottery,...request})]);
  return result.rows[0].result;
}
const request = (kind, order=sorted, extra={}) => ({numberOrder:order, explorePeriods:kind==='tianheng'?3:2,
  exploreDateOffset:0, exploreRange:'標準範圍', ruleCount:1, roadTypes:['加減'], selectedStreaks:['連2'], ...extra});
const gongRequest = {periodRange:50, exploreDirections:['forward'], firstStageDirections:['forward'],
  firstRoadTypes:['加減'], secondStageDirections:['forward'], secondRoadTypes:['加減']};

test('sorted stage is visible immediately and actual stage cannot borrow a legacy or sorted run', async () => {
  await run(previous, 'legacy'); await run(current, 'legacy'); await run(current, 'sorted', 'complete', {dirtyOrder:true});
  for (const kind of ['explore','tianheng','tianyan']) {
    const result = await rpc(`matrix_${kind}_list_impl`, request(kind));
    assert.equal(result.analysisVersion, '115000222:matrix-python-v14-sorted');
    assert.deepEqual(result.items.map(row => row.id), ['sorted-s']);
    await assert.rejects(rpc(`matrix_${kind}_list_impl`, request(kind, actual)), /ANALYSIS_NOT_READY/);
  }
});

test('latest pending draw is not replaced by a prior completed draw; explicit offsets retain their draw identity', async () => {
  await run(previous, 'legacy');
  for (const kind of ['explore','tianheng','tianyan']) {
    await assert.rejects(rpc(`matrix_${kind}_list_impl`, request(kind)), /ANALYSIS_NOT_READY/);
    assert.equal((await rpc(`matrix_${kind}_list_impl`, request(kind,sorted,{exploreDateOffset:1}))).drawPeriod, previous);
    assert.equal((await rpc(`matrix_${kind}_list_impl`, request(kind,sorted,{drawPeriod:previous}))).drawPeriod, previous);
  }
  await assert.rejects(rpc('matrix_tiangong_list_impl', gongRequest), /ANALYSIS_NOT_READY/);
  await assert.rejects(rpc('matrix_status_sources_get'), /ANALYSIS_NOT_READY/);
  await assert.rejects(rpc('matrix_status_get'), /ANALYSIS_NOT_READY/);
});

test('confirmed draw has distinct order results and Tianyan/Tiangong keep sorted after actual finishes', async () => {
  await confirm(); await run(current,'sorted'); await run(current,'draw');
  for (const kind of ['explore','tianheng','tianyan']) {
    const s = await rpc(`matrix_${kind}_list_impl`, request(kind));
    const a = await rpc(`matrix_${kind}_list_impl`, request(kind,actual));
    assert.equal(s.analysisVersion, '115000222:matrix-python-v14-sorted');
    assert.equal(a.analysisVersion, '115000222:matrix-python-v14-draw');
    assert.deepEqual(a.items.map(row=>row.id), ['draw-a']);
  }
  const gong = await rpc('matrix_tiangong_list_impl', gongRequest);
  assert.equal(gong.analysisVersion, '115000222:matrix-python-v14-sorted');
  assert.deepEqual(gong.items.map(row=>row.id), ['sorted-gong']);
});

test('confirmation and explicit order are both required, including confirmed sorted-only lotteries', async () => {
  await run(current,'sorted'); await run(current,'draw');
  for (const order of [null, []]) {
    await confirm(order);
    for (const kind of ['explore','tianheng','tianyan'])
      await assert.rejects(rpc(`matrix_${kind}_list_impl`,request(kind,actual)), /ANALYSIS_NOT_READY/);
    assert.deepEqual((await rpc('matrix_status_sources_get')).explore.items.map(row=>row.id), ['sorted-s']);
  }
});

test('legacy compatibility is restricted to the same draw and stops as soon as either v14 run exists', async () => {
  await confirm(); await run(current,'legacy');
  assert.equal((await rpc('matrix_explore_list_impl',request('explore',actual))).analysisVersion,'115000222:matrix-python-v13');
  await run(current,'sorted','running');
  for (const order of [sorted,actual])
    await assert.rejects(rpc('matrix_explore_list_impl',request('explore',order)), /ANALYSIS_NOT_READY/);
});

test('partially stored completed stages are unavailable even if their result rows already exist', async () => {
  await run(current,'sorted','complete',{omitKind:'status'});
  await assert.rejects(rpc('matrix_explore_list_impl',request('explore')), /ANALYSIS_NOT_READY/);
});

test('status merges only the completed current stages and keeps sorted chapter output', async () => {
  await run(previous,'legacy'); await run(current,'sorted');
  let source = await rpc('matrix_status_sources_get');
  assert.equal(source.drawPeriod,current);
  assert.deepEqual(source.explore.items.map(row=>row.id), ['sorted-s']);
  assert.deepEqual(source.tianyan.items.map(row=>row.id), ['sorted-s']);
  await confirm(); await run(current,'draw','running');
  source = await rpc('matrix_status_sources_get');
  assert.deepEqual(source.explore.items.map(row=>row.id), ['sorted-s']);
  await db.query("update public.matrix_analysis_runs set status='complete' where analysis_version=$1",[version(current,'draw')]);
  source = await rpc('matrix_status_sources_get');
  assert.deepEqual(source.explore.items.map(row=>row.id), ['sorted-s','draw-a']);
  assert.deepEqual(source.tianyan.items.map(row=>row.id), ['sorted-s','draw-a']);
  assert.equal((await rpc('matrix_status_get')).summary.marker,'sorted');
  for (const itemId of ['sorted-s','draw-a']) {
    const response = await rpc('matrix_status_validation_source_get', {drawPeriod:current,analysisVersion:source.analysisVersion,itemId});
    assert.equal(response.validation.marker, `${current}-${itemId}`);
  }
});

test('validation reads accept current v14 stages and reject unconfirmed actual or superseded legacy rows', async () => {
  await run(current,'legacy'); await run(current,'sorted'); await run(current,'draw');
  for (const kind of ['explore','tianheng','tianyan']) {
    const args = {...request(kind),drawPeriod:current,analysisVersion:version(current,'sorted'),itemId:'sorted-s'};
    assert.equal((await rpc(`matrix_${kind}_validation_impl`,args)).validation.marker,`${current}-sorted-s`);
    await assert.rejects(rpc(`matrix_${kind}_validation_impl`,{...args,analysisVersion:version(current,'draw'),itemId:'draw-a'}), /ANALYSIS_VERSION_MISMATCH/);
    await assert.rejects(rpc(`matrix_${kind}_validation_impl`,{...args,analysisVersion:version(current,'legacy'),itemId:'legacy-s'}), /ANALYSIS_VERSION_MISMATCH/);
  }
  await confirm();
  for (const kind of ['explore','tianheng','tianyan'])
    assert.equal((await rpc(`matrix_${kind}_validation_impl`,{...request(kind),drawPeriod:current,analysisVersion:version(current,'draw'),itemId:'draw-a'})).validation.marker,`${current}-draw-a`);
  await assert.rejects(rpc('matrix_tiangong_validation_impl',{drawPeriod:current,analysisVersion:version(current,'draw'),itemId:'draw-gong'}),/ANALYSIS_VERSION_MISMATCH/);
});

test('entitlement checks still reject restricted search settings', async () => {
  await run(current,'sorted');
  await db.exec(`select set_config('test.entitlements','{"canUseSeven":false,"canUseThirteen":false,"canUseFullRange":false,"canUseTianyan":false,"canUseTiangong":false}',false)`);
  await assert.rejects(rpc('matrix_explore_list_impl',request('explore',sorted,{explorePeriods:13})), /FORBIDDEN/);
  await assert.rejects(rpc('matrix_tianheng_list_impl',request('tianheng',sorted,{explorePeriods:13})), /FORBIDDEN/);
  await assert.rejects(rpc('matrix_tianyan_list_impl',request('tianyan')), /FORBIDDEN/);
  await assert.rejects(rpc('matrix_tiangong_list_impl',gongRequest), /FORBIDDEN/);
});

test('preliminary legacy data exposes only sorted rows even if it stored both orders', async () => {
  await run(current,'legacy');
  await db.query('update public.lottery_draws set draw_order_numbers=$1 where period=$2', ['[5,4,3,2,1]',current]);
  for (const kind of ['explore','tianheng','tianyan']) {
    assert.equal((await rpc(`matrix_${kind}_list_impl`,request(kind))).analysisVersion,'115000222:matrix-python-v13');
    await assert.rejects(rpc(`matrix_${kind}_list_impl`,request(kind,actual)), /ANALYSIS_NOT_READY/);
    await assert.rejects(rpc(`matrix_${kind}_validation_impl`,{...request(kind),drawPeriod:current,
      analysisVersion:version(current,'legacy'),itemId:'legacy-a'}), /INVALID_REQUEST/);
  }
  const source = await rpc('matrix_status_sources_get');
  assert.deepEqual(source.explore.items.map(row=>row.id),['legacy-s']);
  assert.deepEqual(source.tianyan.items.map(row=>row.id),['legacy-s']);
});

test('chunked Tianyan lists and validations read the matching stage after both stages finish', async () => {
  await confirm(); await run(current,'sorted'); await run(current,'draw');
  const v = version(current,'sorted');
  const result = await db.query("select payload from public.matrix_analysis_artifacts where analysis_version=$1 and kind='tianyan'",[v]);
  await db.query(`insert into public.matrix_analysis_artifact_chunks(lottery,draw_period,analysis_version,kind,
    chunk_index,cursor_start,cursor_end,payload,expires_at) values ($1,$2,$3,'tianyan',0,0,1,$4,now()+interval '1 day')`,
    [lottery,current,v,JSON.stringify(result.rows[0].payload)]);
  await db.query("update public.matrix_analysis_artifacts set payload=$1 where analysis_version=$2 and kind='tianyan'",
    [JSON.stringify({storage:'chunks'}),v]);
  assert.deepEqual((await rpc('matrix_tianyan_list_impl',request('tianyan'))).items.map(row=>row.id),['sorted-s']);
  assert.equal((await rpc('matrix_tianyan_validation_impl',{drawPeriod:current,analysisVersion:v,itemId:'sorted-s'})).validation.marker,`${current}-sorted-s`);
});

test('status composite details resolve Tianyan items from the merged stage source', async () => {
  await confirm(); await run(current,'sorted'); await run(current,'draw');
  const v = version(current,'draw');
  const tianyan = {lottery,drawPeriod:current,items:[item('composite-a',actual)],validationById:{'composite-a':{marker:'actual-composite'}}};
  await db.query("update public.matrix_analysis_artifacts set payload=$1 where analysis_version=$2 and kind='tianyan'",[JSON.stringify(tianyan),v]);
  await db.query("update public.matrix_analysis_artifacts set payload=jsonb_set(payload,'{statusSources,tianyan}',$1) where analysis_version=$2 and kind='status'",[JSON.stringify(tianyan),v]);
  const source = await rpc('matrix_status_sources_get');
  assert.equal((await rpc('matrix_status_validation_source_get',{drawPeriod:current,analysisVersion:source.analysisVersion,itemId:'composite-a'})).validation.marker,'actual-composite');
});

test('private implementations and routing helpers remain unavailable to API roles; service sources stay restricted', async () => {
  const result = await db.query(`select p.proname,
      has_function_privilege('anon',p.oid,'execute') as anon,
      has_function_privilege('authenticated',p.oid,'execute') as authenticated,
      has_function_privilege('service_role',p.oid,'execute') as service
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='private' and (p.proname like 'matrix_analysis_%' or p.proname like '%_impl' or p.proname='matrix_status_read_payload'))
       or (n.nspname='public' and p.proname in ('matrix_status_sources_get','matrix_status_validation_source_get'))`);
  assert.equal(result.rows.length,14);
  for (const row of result.rows) {
    assert.equal(row.anon,false,row.proname);
    assert.equal(row.authenticated,false,row.proname);
    assert.equal(row.service,['matrix_status_sources_get','matrix_status_validation_source_get'].includes(row.proname),row.proname);
  }
});
