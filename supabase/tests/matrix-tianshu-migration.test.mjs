import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const db = new PGlite();
const lottery = '今彩539';
const period = '115000220';
const sorted = '依號碼由小到大排序';
const actual = '依實際開獎順序排序';
const started = '2026-09-19T00:00:00Z';
const allKinds = ['explore', 'tianheng', 'tianshu', 'tianyan', 'tiangong', 'status'];
const legacyKinds = allKinds.filter(kind => kind !== 'tianshu');

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema private; create schema auth; create schema storage;
    create function auth.role() returns text language sql stable as $$
      select current_setting('request.jwt.claim.role',true)
    $$;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create function private.matrix_result_entitlements() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('test.entitlements',true),'')::jsonb,
        '{"canUseSeven":true,"canUseThirteen":true,"canUseFullRange":true,"canUseTianyan":true,"canUseTiangong":true,"canViewFullStatus":true}'::jsonb)
    $$;
    create table private.security_identity_secret(secret text not null);
    insert into private.security_identity_secret values ('test-secret');
    create function private.security_collect(text,text,boolean,text) returns jsonb language sql as $$
      select '{"allowed":true}'::jsonb
    $$;
    create schema cron;
    create table cron.job(jobid bigint generated always as identity primary key,jobname text,schedule text,command text,active boolean default true);
    create function cron.schedule(text,text,text) returns bigint language plpgsql as $$
      declare job bigint; begin insert into cron.job(jobname,schedule,command) values ($1,$2,$3) returning jobid into job; return job; end
    $$;
    create function cron.unschedule(bigint) returns boolean language plpgsql as $$
      begin delete from cron.job where jobid=$1; return found; end
    $$;`);
  await db.exec(read('./fixtures/matrix-analysis-tables.sql'));
  for (const file of [
    '20260824223022_matrix_analysis_artifact_chunks.sql',
    '20260903185906_matrix_analysis_run_lease.sql',
    '20260905122413_create_static_matrix_card_publication.sql',
    '20260905141003_repair_matrix_analysis_retention_and_recovery.sql',
  ]) await db.exec(read(`../migrations/${file}`));
  await db.exec('alter table public.lottery_draws drop column result_status');
  for (const file of [
    '20260912164917_two_stage_lottery_results.sql',
    '20260912164938_matrix_order_analysis_reads.sql',
    '20260912192941_preserve_provisional_draw_identity.sql',
    '20260912192953_matrix_analysis_owned_writes.sql',
    '20260912193421_matrix_analysis_seal_direct_writes.sql',
    '20260912202503_avoid_unchanged_draw_writes.sql',
    '20260912230514_matrix_analysis_active_versions.sql',
    '20260913031818_matrix_analysis_retention_v2.sql',
    '20260914114232_guard_degradation.sql',
    '20260914153439_matrix_storage_pending_cleanup_health.sql',
  ]) await db.exec(read(`../migrations/${file}`));
  await db.exec(read('../migrations/20260919101456_matrix_tianshu.sql'));
});
after(async () => db.close());
beforeEach(async () => {
  await db.exec(`reset role; begin;
    truncate public.lottery_draws, public.matrix_analysis_runs cascade;
    update private.matrix_maintenance_status set last_started_at=null,last_finished_at=null,last_deleted=0,
      deletable_backlog=0,last_error=null,cleanup_enabled=false where job_name='analysis-retention';
    select set_config('test.entitlements','',false);`);
});
afterEach(async () => db.exec('rollback'));

const version = (major = 15, order = 'sorted', p = period) => `${p}:matrix-python-v${major}-${order}`;
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];

async function draw({ p = period, order = ['05', '04', '03', '02', '01'], status = 'confirmed' } = {}) {
  await db.query(`insert into public.lottery_draws(lottery,period,draw_date,numbers,sorted_numbers,draw_order_numbers,result_status)
    select $1,$2,'2026-09-19','["01","02","03","04","05"]','["01","02","03","04","05"]',$3,$4
    where not exists (select 1 from public.lottery_draws where lottery=$1 and period=$2)`,
  [lottery, p, order === null ? null : JSON.stringify(order), status]);
}

async function run({ analysisVersion = version(), status = 'complete', kinds = allKinds, active = status === 'complete', expires = '1 day' } = {}) {
  const p = analysisVersion.split(':', 1)[0];
  await draw({ p });
  await db.query(`insert into public.matrix_analysis_runs
      (lottery,draw_period,analysis_version,phase,status,started_at,completed_at,lease_owner,lease_expires_at)
    values ($1,$2,$3,'status',$4,$5,case when $4='complete' then now() end,
      case when $4='running' then 'worker' end,case when $4='running' then clock_timestamp()+interval '5 minutes' end)`,
  [lottery, p, analysisVersion, status, started]);
  for (const kind of kinds) {
    await db.query(`insert into public.matrix_analysis_artifacts
        (lottery,draw_period,analysis_version,kind,payload,completed_at,expires_at)
      values ($1,$2,$3,$4,'{}',now(),now()+$5::interval)`, [lottery, p, analysisVersion, kind, expires]);
  }
  if (active) {
    const order = analysisVersion.endsWith('-draw') ? 'draw' : 'sorted';
    await db.query(`insert into private.matrix_analysis_active_versions(lottery,draw_period,number_order,analysis_version)
      values ($1,$2,$3,$4)`, [lottery, p, order, analysisVersion]);
  }
  return analysisVersion;
}

function tianshuRecord({ analysisVersion = version(), id = 'triple-1', marker = 'first', prediction = ['07'],
  numberOrder = sorted, range = '標準範圍', sourceIndex = 0, thirdPosition = 3, expiresAt = '2030-01-01T00:00:00Z' } = {}) {
  const p = analysisVersion.split(':', 1)[0];
  return {
    lottery, draw_period: p, analysis_version: analysisVersion, item_id: id,
    first_number: '01', first_locked_position: 1, second_number: '02', second_locked_position: 2,
    third_number: '03', third_locked_position: thirdPosition, prediction_distance: 1,
    consecutive: '連2', highest_streak: 2, prediction_numbers: prediction,
    algorithm_type: '加減', number_order: numberOrder, rule_count: 1, explore_range: range,
    locked_source_index: sourceIndex, locked_source_period: p, reference_offset: null,
    reference_position: null,
    item: {id, marker, firstNumber:'01', firstLockedPosition:1, secondNumber:'02', secondLockedPosition:2,
      thirdNumber:'03', thirdLockedPosition:thirdPosition, predictionNumbers:prediction, predictionDistance:1,
      consecutive:'連2', highestStreak:2, algorithmType:'加減', numberOrder, ruleCount:1,
      lockedSourceIndex:sourceIndex},
    validation: {itemId:id, lockedPositions:[1,2,thirdPosition], lockedNumbers:['01','02','03'], rules:[{},{}]},
    expires_at: expiresAt, created_at: started,
  };
}

async function insertTianshu(record) {
  await db.query(`insert into public.matrix_tianshu_results
    select * from jsonb_populate_record(null::public.matrix_tianshu_results,$1::jsonb)`, [JSON.stringify(record)]);
}

const request = (extra = {}) => ({lottery, numberOrder:sorted, explorePeriods:3, exploreDateOffset:0,
  exploreRange:'標準範圍', ruleCount:1, roadTypes:['加減'], selectedStreaks:['連2'], ...extra});
async function rpc(name, body, role = 'authenticated') {
  await db.exec('savepoint role_call');
  await db.exec(`set local role ${role}`);
  try {
    const value = await scalar(`select public.${name}($1::jsonb)`, [JSON.stringify(body)]);
    await db.exec('reset role; release savepoint role_call');
    return value;
  } catch (error) {
    await db.exec('rollback to savepoint role_call; release savepoint role_call');
    throw error;
  }
}
async function ownedWrite(records, { analysisVersion = version(), owner = 'worker', generation = started } = {}) {
  await db.exec('savepoint owned_write');
  await db.exec('set local role service_role');
  try {
    const value = await scalar('select public.matrix_analysis_write_owned($1,$2,$3,$4,$5,$6,$7)',
      [lottery, period, analysisVersion, owner, generation, 'matrix_tianshu_results', JSON.stringify(records)]);
    await db.exec('reset role; release savepoint owned_write');
    return value;
  } catch (error) {
    await db.exec('rollback to savepoint owned_write; release savepoint owned_write');
    throw error;
  }
}

test('migration creates sealed three-lock storage and member-only RPCs', async () => {
  const columns = (await db.query(`select column_name,is_nullable from information_schema.columns
    where table_schema='public' and table_name='matrix_tianshu_results' order by ordinal_position`)).rows;
  assert.ok(columns.some(column => column.column_name === 'third_number' && column.is_nullable === 'NO'));
  assert.ok(columns.some(column => column.column_name === 'third_locked_position' && column.is_nullable === 'NO'));
  assert.equal(await scalar("select relrowsecurity from pg_class where oid='public.matrix_tianshu_results'::regclass"), true);
  const acl = await db.query(`select has_table_privilege('anon','public.matrix_tianshu_results','SELECT') anon,
    has_table_privilege('authenticated','public.matrix_tianshu_results','SELECT') authenticated,
    has_table_privilege('service_role','public.matrix_tianshu_results','SELECT') service_select,
    has_table_privilege('service_role','public.matrix_tianshu_results','INSERT,UPDATE') service_write,
    has_table_privilege('service_role','public.matrix_tianshu_results','DELETE') service_delete`);
  assert.deepEqual(acl.rows[0], {anon:false, authenticated:false, service_select:true, service_write:false, service_delete:true});
  for (const fn of ['matrix_tianshu_list(jsonb)', 'matrix_tianshu_validation(jsonb)']) {
    assert.equal(await scalar('select has_function_privilege($1,$2,$3)', ['anon', `public.${fn}`, 'EXECUTE']), false);
    assert.equal(await scalar('select has_function_privilege($1,$2,$3)', ['authenticated', `public.${fn}`, 'EXECUTE']), true);
    assert.equal(await scalar('select has_function_privilege($1,$2,$3)', ['service_role', `public.${fn}`, 'EXECUTE']), true);
  }
  for (const fn of ['matrix_tianshu_list_impl(jsonb)', 'matrix_tianshu_validation_impl(jsonb)']) {
    for (const role of ['anon','authenticated','service_role'])
      assert.equal(await scalar('select has_function_privilege($1,$2,$3)', [role, `private.${fn}`, 'EXECUTE']), false);
  }
  for (const role of ['anon','authenticated','service_role'])
    assert.equal(await scalar('select has_function_privilege($1,$2,$3)',
      [role, 'private.matrix_request_guard(text,jsonb)', 'EXECUTE']), false);
  await run({status:'running',kinds:[],active:false});
  await db.exec("update public.matrix_analysis_runs set phase='tianshu'");
  await db.query(`insert into public.matrix_analysis_artifact_chunks
    (lottery,draw_period,analysis_version,kind,chunk_index,cursor_start,cursor_end,payload,expires_at)
    values ($1,$2,$3,'tianshu',0,0,1,'{}',now()+interval '1 day')`, [lottery,period,version()]);
  assert.equal(await scalar("select kind from public.matrix_analysis_artifact_chunks where kind='tianshu'"), 'tianshu');
});

test('list and validation expose the same active v15 triple-lock result', async () => {
  await run();
  await insertTianshu(tianshuRecord());
  const listed = await rpc('matrix_tianshu_list', request());
  assert.equal(listed.kind, 'tianshu');
  assert.equal(listed.analysisVersion, version());
  assert.equal(listed.total, 1);
  assert.deepEqual(listed.items.map(item => [item.thirdNumber,item.thirdLockedPosition]), [['03',3]]);
  const validated = await rpc('matrix_tianshu_validation', request({drawPeriod:period,analysisVersion:version(),itemId:'triple-1'}));
  assert.equal(validated.kind, 'tianshu');
  assert.equal(validated.analysisVersion, listed.analysisVersion);
  assert.deepEqual(validated.validation.lockedPositions, [1,2,3]);
  assert.deepEqual(validated.validation.lockedNumbers, ['01','02','03']);
  await assert.rejects(
    rpc('matrix_tianshu_validation', request({drawPeriod:period,analysisVersion:version(14),itemId:'triple-1'})),
    /ANALYSIS_VERSION_MISMATCH/,
  );
});

test('list keeps Tianheng filters for same-code, periods, ranges and entitlements', async () => {
  await run();
  for (const record of [
    tianshuRecord({id:'same-1',marker:'same-1'}),
    tianshuRecord({id:'same-2',marker:'same-2',thirdPosition:4}),
    tianshuRecord({id:'late',marker:'late',prediction:['08'],sourceIndex:4}),
    tianshuRecord({id:'full',marker:'full',prediction:['09'],range:'完整範圍'}),
  ]) await insertTianshu(record);
  const same = await rpc('matrix_tianshu_list', request({sameCode:true}));
  assert.deepEqual(same.items.map(item => item.id), ['same-1','same-2']);
  const thirteen = await rpc('matrix_tianshu_list', request({explorePeriods:13,predictionNumber:'08'}));
  assert.deepEqual(thirteen.items.map(item => item.id), ['late']);
  const full = await rpc('matrix_tianshu_list', request({exploreRange:'完整範圍',predictionNumber:'09'}));
  assert.deepEqual(full.items.map(item => item.id), ['full']);
  await db.exec(`select set_config('test.entitlements','{"canUseThirteen":false,"canUseFullRange":false}',false)`);
  await assert.rejects(rpc('matrix_tianshu_list', request({explorePeriods:13})), /FORBIDDEN/);
  await assert.rejects(rpc('matrix_tianshu_list', request({exploreRange:'完整範圍'})), /FORBIDDEN/);
});

test('owned writes require current lease ownership and all third-lock fields', async () => {
  await run({status:'running', kinds:[]});
  const record = tianshuRecord();
  assert.equal(await ownedWrite([record]), true);
  assert.equal(await ownedWrite([{...record,item_id:'stale'}], {owner:'old-worker'}), false);
  assert.equal(await ownedWrite([{...record,third_number:'04'}]), true);
  assert.equal(await scalar('select third_number from public.matrix_tianshu_results'), '04');
  assert.equal(Number(await scalar('select count(*) from public.matrix_tianshu_results')), 1);
  await assert.rejects(ownedWrite([{...record,item_id:'missing-third',third_number:null}]), /null value.*third_number/);
  await assert.rejects(ownedWrite([
    {...record,item_id:'batch-valid'},
    {...record,item_id:'bad-order',third_locked_position:2},
  ]), /matrix_tianshu_results_check1/);
  assert.equal(Number(await scalar('select count(*) from public.matrix_tianshu_results')), 1);
  await db.exec('savepoint direct_write');
  await db.exec('set local role service_role');
  await assert.rejects(db.exec('update public.matrix_tianshu_results set third_number=\'04\''), /permission denied/);
  await db.exec('rollback to savepoint direct_write; release savepoint direct_write');
});

test('completed restore requires matching generation and TianShu artifact', async () => {
  await run();
  const record = tianshuRecord();
  await db.exec('set local role service_role');
  assert.equal(await scalar('select public.matrix_analysis_restore_results($1,$2,$3,$4,$5,$6)',
    [lottery,period,version(),started,'tianshu',JSON.stringify([record])]), true);
  assert.equal(await scalar('select public.matrix_analysis_restore_results($1,$2,$3,$4,$5,$6)',
    [lottery,period,version(),'2026-09-18T00:00:00Z','tianshu',JSON.stringify([{...record,third_number:'04'}])]), false);
  await db.exec('reset role');
  assert.equal(await scalar('select third_number from public.matrix_tianshu_results'), '03');
  await db.exec("delete from public.matrix_analysis_artifacts where kind='tianshu'");
  await db.exec('set local role service_role');
  assert.equal(await scalar('select public.matrix_analysis_restore_results($1,$2,$3,$4,$5,$6)',
    [lottery,period,version(),started,'tianshu',JSON.stringify([{...record,third_number:'04'}])]), false);
  await db.exec('reset role');
});

test('required kinds parse exact numeric versions and completion gates v15+', async () => {
  for (const [analysisVersion, expected] of [
    [version(14), []],
    [version(15), ['tianshu']],
    [`${period}:matrix-python-v15`, ['tianshu']],
    [version(140), ['tianshu']],
    [`${period}:matrix-python-preview`, []],
  ]) {
    await run({analysisVersion,status:'running',kinds:legacyKinds,active:false});
    assert.deepEqual(await scalar('select private.matrix_analysis_missing_kinds($1,$2,$3)',
      [lottery,period,analysisVersion]), expected);
  }
  await db.exec('set local role service_role');
  assert.equal(await scalar('select public.matrix_analysis_complete_owned($1,$2,$3,$4,now())',
    [lottery,period,version(15),'worker']), false);
  assert.equal(await scalar('select public.matrix_analysis_complete_owned($1,$2,$3,$4,now())',
    [lottery,period,version(14),'worker']), true);
  await db.exec('reset role');
  assert.equal(await scalar("select analysis_version from private.matrix_analysis_active_versions where number_order='sorted'"), version(14));
  assert.equal(await scalar('select private.matrix_analysis_active_version($1,$2,$3,$4)',
    [lottery,period,sorted,'explore']), version(14));
  await db.query(`insert into public.matrix_analysis_artifacts(lottery,draw_period,analysis_version,kind,payload,completed_at,expires_at)
    values ($1,$2,$3,'tianshu','{}',now(),now()+interval '1 day')`, [lottery,period,version(15)]);
  await db.exec('set local role service_role');
  assert.equal(await scalar('select public.matrix_analysis_complete_owned($1,$2,$3,$4,now())',
    [lottery,period,version(15),'worker']), true);
  await db.exec('reset role');
  assert.equal(await scalar("select analysis_version from private.matrix_analysis_active_versions where number_order='sorted'"), version(15));
  await db.exec("delete from public.matrix_analysis_artifacts where analysis_version='115000220:matrix-python-v15-sorted' and kind='tianshu'");
  const health = (await db.query('select * from private.matrix_analysis_active_version_health()')).rows;
  assert.ok(health.some(row => row.issue === 'missing_kinds' && row.missing_kinds.includes('tianshu')));
});

test('cleanup preview, bounded deletion and storage health include TianShu', async () => {
  const oldVersion = version(15,'sorted','115000100');
  await draw({p:'115000100'});
  await db.query(`insert into public.matrix_analysis_runs(lottery,draw_period,analysis_version,phase,status,started_at,error)
    values ($1,'115000100',$2,'complete','failed',now(),'test')`, [lottery,oldVersion]);
  await insertTianshu(tianshuRecord({analysisVersion:oldVersion,expiresAt:'2026-09-18T00:00:00Z'}));
  let preview = (await db.query("select * from private.matrix_analysis_cleanup_preview() where table_name='tianshu'")).rows[0];
  assert.equal(Number(preview.expired_deletable), 1);
  const health = await scalar('select public.matrix_analysis_storage_health()');
  assert.ok(health.tables.tianshu.size_bytes >= 0);
  await db.exec("update private.matrix_maintenance_status set cleanup_enabled=true where job_name='analysis-retention'");
  assert.equal(await scalar("select private.matrix_analysis_cleanup_batch('2026-09-19T12:00:00Z',5000)"), 1);
  assert.equal(Number(await scalar('select count(*) from public.matrix_tianshu_results')), 0);
  preview = (await db.query("select * from private.matrix_analysis_cleanup_preview() where table_name='tianshu'")).rows[0];
  assert.equal(Number(preview.expired_deletable), 0);
});
