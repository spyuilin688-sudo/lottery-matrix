import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../migrations/20260912230514_matrix_analysis_active_versions.sql');
const db = new PGlite();
const lottery = '今彩539';
const period = '115000220';
const sorted = '依號碼由小到大排序';
const actual = '依實際開獎順序排序';
const kinds = ['explore', 'tianheng', 'tianyan', 'tiangong', 'status'];
const version = (stage = 'v15-sorted', p = period) => `${p}:matrix-python-${stage}`;

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema private; create schema auth;
    create function auth.role() returns text language sql stable as $$
      select current_setting('request.jwt.claim.role',true)
    $$;
    select set_config('request.jwt.claim.role','service_role',false);
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`);
  await db.exec(read('./fixtures/matrix-analysis-tables.sql'));
  await db.exec(read('../migrations/20260825060000_matrix_analysis_artifact_chunks.sql'));
  await db.exec(read('../migrations/20260903185906_matrix_analysis_run_lease.sql'));
  await db.exec(read('../migrations/20260905122413_create_static_matrix_card_publication.sql'));
  await db.exec(read('../migrations/20260905141003_repair_matrix_analysis_retention_and_recovery.sql'));
  // The shared read fixture already has this column; let the real stage migration
  // recreate it, its constraint, and the current source-invalidation trigger.
  await db.exec('alter table public.lottery_draws drop column result_status');
  await db.exec(read('../migrations/20260912164917_two_stage_lottery_results.sql'));
  await db.exec(read('../migrations/20260912164938_matrix_order_analysis_reads.sql'));
  await db.exec(read('../migrations/20260912192941_preserve_provisional_draw_identity.sql'));
  await db.exec(read('../migrations/20260912192953_matrix_analysis_owned_writes.sql'));
  await db.exec(read('../migrations/20260912193421_matrix_analysis_seal_direct_writes.sql'));
  await db.exec(read('../migrations/20260912202503_avoid_unchanged_draw_writes.sql'));
});
after(async () => db.close());
beforeEach(async () => {
  await db.exec('reset role; begin; truncate public.lottery_draws, public.matrix_analysis_runs cascade;');
});
// Each test uses a rollback, including the migration DDL itself.
afterEach(async () => db.exec('rollback'));
async function apply() { await db.exec(migration.replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, '')); }
async function draw({ p = period, l = lottery, date = '2026-09-12', order = ['05','04','03','02','01'], status = 'confirmed', numbers = ['01','02','03','04','05'] } = {}) {
  await db.query(`insert into public.lottery_draws(lottery,period,draw_date,numbers,sorted_numbers,draw_order_numbers,result_status)
    values ($1,$2,$3,$4,$4,$5,$6)`, [l,p,date,JSON.stringify(numbers),order === null ? null : JSON.stringify(order),status]);
}
async function run({ p = period, l = lottery, stage = 'v15-sorted', status = 'complete', omit = [], owner = 'worker', expires = '1 hour', completed = '2026-09-12T01:00:00Z' } = {}) {
  const v = version(stage,p);
  await db.query(`insert into public.matrix_analysis_runs(lottery,draw_period,analysis_version,phase,status,started_at,completed_at,lease_owner,lease_expires_at)
    values ($1,$2,$3,'status',$4,'2026-09-12T00:00:00Z',$5,$6,clock_timestamp()+$7::interval)`, [l,p,v,status,completed,owner,expires]);
  for (const kind of kinds.filter(kind => !omit.includes(kind))) {
    await db.query(`insert into public.matrix_analysis_artifacts(lottery,draw_period,analysis_version,kind,payload,completed_at,expires_at)
      values ($1,$2,$3,$4,'{}',now(),now()-interval '1 day')`, [l,p,v,kind]);
  }
  return v;
}
async function manifest() {
  return (await db.query('select lottery,draw_period,number_order,analysis_version from private.matrix_analysis_active_versions order by lottery,draw_period,number_order')).rows;
}
async function active(order = sorted, kind = 'explore', l = lottery, p = period) {
  return (await db.query('select private.matrix_analysis_active_version($1,$2,$3,$4) as version',[l,p,order,kind])).rows[0].version;
}
async function complete({ stage = 'v15-sorted', owner = 'worker', l = lottery, at = '2026-09-12T02:00:00Z' } = {}) {
  return (await db.query('select public.matrix_analysis_complete_owned($1,$2,$3,$4,$5) as accepted',[l,period,version(stage),owner,at])).rows[0].accepted;
}
async function state() { return (await db.query('select to_jsonb(r) as run from public.matrix_analysis_runs r order by analysis_version')).rows; }
async function acquire(owner = 'worker') {
  return (await db.query('select public.matrix_analysis_acquire_run($1,$2,$3,$4,$5,300) as run',
    [lottery,period,version(),owner,'2026-09-12T00:00:00Z'])).rows[0].run;
}
async function writeArtifacts(acquired, owner = 'worker', marker = 'current') {
  const records = kinds.map(kind => ({lottery,draw_period:period,analysis_version:version(),kind,
    payload:{marker},completed_at:'2026-09-12T01:00:00Z',expires_at:'2030-01-01T00:00:00Z'}));
  return (await db.query('select public.matrix_analysis_write_owned($1,$2,$3,$4,$5,$6,$7) as accepted',
    [lottery,period,version(),owner,acquired.started_at,'matrix_analysis_artifacts',JSON.stringify(records)])).rows[0].accepted;
}

test('backfill ranks distinct completed periods by draw date and retains exactly three per lottery', async () => {
  for (const [p,date] of [['900','2026-09-08'],['101','2026-09-09'],['102','2026-09-10'],['103','2026-09-11'],['104','2026-09-12']]) {
    await draw({p,date,order:null});
    await run({p,stage:'v12',status:p === '104' ? 'running' : 'complete'});
    if (p === '103') await run({p,stage:'v13'});
  }
  await draw({l:'天天樂',order:null}); await run({l:'天天樂',stage:'v12'});
  await apply();
  const rows = await manifest();
  assert.deepEqual(rows.filter(r => r.lottery === lottery).map(r => r.draw_period), ['101','102','103']);
  assert.equal(rows.length,4);
  assert.deepEqual((await db.query('select * from private.matrix_analysis_active_version_health()')).rows,[]);
});

test('complete v12 fills both eligible orders and expired artifacts remain readable', async () => {
  await draw(); await run({stage:'v12'}); await apply();
  assert.equal((await manifest()).length,2);
  for (const order of [sorted,actual]) for (const kind of kinds) assert.equal(await active(order,kind),version('v12'));
});

test('missing historical tianheng fails closed and rolls back all migration DDL', async () => {
  await draw(); await run({stage:'v12',omit:['tianheng']});
  await db.exec('savepoint migration');
  await assert.rejects(apply,/MATRIX_ACTIVE_VERSION_BACKFILL_INCOMPLETE/);
  await db.exec('rollback to savepoint migration');
  assert.equal((await db.query("select to_regclass('private.matrix_analysis_active_versions') as relation")).rows[0].relation,null);
  assert.equal((await state()).length,1);
});

test('suffix candidates beat readable legacy; latest complete matching suffix wins', async () => {
  await draw(); await run({stage:'v13'}); await run({stage:'v14-sorted',completed:'2026-09-12T02:00:00Z'});
  await run({stage:'v15-sorted',completed:'2026-09-12T03:00:00Z'}); await run({stage:'v15-draw'}); await apply();
  assert.equal(await active(),version()); assert.equal(await active(actual),version('v15-draw'));
});

test('current readable legacy beats a newer legacy fallback when no complete split exists', async () => {
  await draw(); await run({stage:'v13',completed:'2026-09-12T01:00:00Z'});
  await run({stage:'v12',completed:'2026-09-12T02:00:00Z'}); await apply();
  assert.equal(await active(),version('v13')); assert.equal(await active(actual),version('v13'));
});

test('sorted-only suffix cannot supply an expected draw slot', async () => {
  await draw(); await run(); await assert.rejects(apply,/MATRIX_ACTIVE_VERSION_BACKFILL_INCOMPLETE/);
});

test('天天樂 never requires or reads a draw slot even with supplied draw numbers', async () => {
  await draw({l:'天天樂'}); await run({l:'天天樂'}); await apply();
  assert.equal((await manifest()).length,1); assert.equal(await active(actual,'explore','天天樂'),null);
});

test('preliminary, absent, empty, duplicate and mismatched draw orders are ineligible', async () => {
  const cases = [{status:'preliminary'}, {order:null}, {order:[]}, {order:[1,1,2,3,4]}, {order:[1,2,3,4,6]}];
  for (const [index,options] of cases.entries()) {
    const p = `p${index}`; await draw({p,date:`2026-09-${12+index}`,...options}); await run({p});
  }
  await apply(); assert.equal((await manifest()).length,3);
  for (let index = 0; index < cases.length; index++) assert.equal(await active(actual,'explore',lottery,`p${index}`),null);
});

test('seven-number draw order requires an unchanged special ball', async () => {
  await draw({l:'六合彩',numbers:[1,2,3,4,5,6,7],order:[7,6,5,4,3,2,1]});
  await run({l:'六合彩'}); await apply(); assert.equal((await manifest()).length,1);
});

test('reader requires complete run, requested artifact and exact Chinese order', async () => {
  await draw({order:null}); await run(); await apply();
  assert.equal(await active('sorted'),null); assert.equal(await active(sorted,'unknown'),null);
  await db.exec("delete from public.matrix_analysis_artifacts where kind='tianheng'");
  assert.equal(await active(sorted,'tianheng'),null); assert.equal(await active(),version());
  await db.exec("update public.matrix_analysis_runs set status='running'"); assert.equal(await active(),null);
});

test('v15 completion atomically completes and activates independent sorted and draw slots', async () => {
  await draw(); await run({status:'running'}); await run({stage:'v15-draw',status:'running'}); await apply();
  await db.exec('set local role service_role'); assert.equal(await complete(),true);
  assert.equal(await complete({stage:'v15-draw'}),true); await db.exec('reset role');
  assert.equal(await active(),version()); assert.equal(await active(actual),version('v15-draw'));
  for (const {run:r} of await state()) {
    assert.equal(r.status,'complete'); assert.equal(r.phase,'complete'); assert.equal(r.lease_owner,null); assert.equal(r.lease_expires_at,null);
    assert.equal(new Date(r.completed_at).toISOString(),'2026-09-12T02:00:00.000Z');
  }
  const before = await state(); assert.equal(await complete(),false); assert.deepEqual(await state(),before);
});

test('replacement completion changes only its order pointer and preserves superseded artifacts', async () => {
  await draw(); await run({stage:'v14-sorted'}); await run({stage:'v14-draw'});
  await run({status:'running'}); await apply(); assert.equal(await complete(),true);
  assert.equal(await active(),version()); assert.equal(await active(actual),version('v14-draw'));
  assert.equal((await state()).length,3);
  assert.equal((await db.query('select count(*)::int as count from public.matrix_analysis_artifacts')).rows[0].count,15);
});

test('wrong, blank, null and expired owners fail without any mutations', async () => {
  await draw({order:null}); await run({status:'running'}); await apply();
  for (const owner of ['previous','', '   ',null]) { const before = await state(); assert.equal(await complete({owner}),false); assert.deepEqual(await state(),before); }
  await db.exec("update public.matrix_analysis_runs set lease_expires_at=clock_timestamp()-interval '1 second'");
  const before = await state(); assert.equal(await complete(),false); assert.deepEqual(await state(),before); assert.deepEqual(await manifest(),[]);
});

test('missing artifacts, missing run, failed run and repeated completion fail without activation', async () => {
  await draw({order:null}); await run({status:'running',omit:['status']}); await apply();
  const before = await state(); assert.equal(await complete(),false); assert.deepEqual(await state(),before);
  assert.equal(await complete({stage:'absent'}),false);
  await db.exec("update public.matrix_analysis_runs set status='failed'"); assert.equal(await complete(),false);
  await db.exec("update public.matrix_analysis_runs set status='complete'"); assert.equal(await complete(),false); assert.deepEqual(await manifest(),[]);
});

test('legacy and unknown-suffix completion never activate a manifest', async () => {
  await draw(); await run({stage:'v12',status:'running'}); await run({stage:'v15-preview',status:'running'}); await apply();
  assert.equal(await complete({stage:'v12'}),true); assert.equal(await complete({stage:'v15-preview'}),true); assert.deepEqual(await manifest(),[]);
});

test('draw completion rejects ineligible draw and 天天樂 without completing run', async () => {
  await draw({order:null}); await draw({l:'天天樂'});
  await run({stage:'v15-draw',status:'running'}); await run({l:'天天樂',stage:'v15-draw',status:'running'}); await apply();
  const before = await state();
  assert.equal(await complete({stage:'v15-draw'}),false); assert.equal(await complete({stage:'v15-draw',l:'天天樂'}),false);
  assert.deepEqual(await state(),before); assert.deepEqual(await manifest(),[]);
});

test('only service role can complete; all API roles lack direct manifest and helper access', async () => {
  await apply();
  for (const role of ['anon','authenticated','service_role']) {
    const perms = (await db.query(`select has_table_privilege($1,'private.matrix_analysis_active_versions','SELECT,INSERT,UPDATE,DELETE') as table_access,
      has_function_privilege($1,'private.matrix_analysis_active_version(text,text,text,text)','EXECUTE') as helper_access,
      has_function_privilege($1,'public.matrix_analysis_complete_owned(text,text,text,text,timestamptz)','EXECUTE') as complete_access`,[role])).rows[0];
    assert.deepEqual(perms,{table_access:false,helper_access:false,complete_access:role === 'service_role'});
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='private.matrix_analysis_active_versions'::regclass")).rows[0].relrowsecurity,true);
});

test('health reports required gaps and historical damaged pointers separately', async () => {
  await draw({order:null}); await run(); await apply();
  await db.exec("delete from public.matrix_analysis_artifacts where kind='tianheng'");
  let health = (await db.query('select * from private.matrix_analysis_active_version_health()')).rows;
  assert.ok(health.some(r => r.issue === 'missing_kinds' && r.required && r.missing_kinds.includes('tianheng')));
  for (let i=1;i<=3;i++) { await draw({p:`new${i}`,date:`2026-09-${12+i}`,order:null}); await run({p:`new${i}`}); }
  health = (await db.query('select * from private.matrix_analysis_active_version_health()')).rows;
  assert.ok(health.some(r => r.issue === 'missing_kinds' && !r.required));
  assert.equal(health.filter(r => r.issue === 'missing_slot' && r.required).length,3);
});

test('health catches a noncomplete pointer while source invalidation clears ineligible draw pointers', async () => {
  await draw(); await run({stage:'v12'}); await apply();
  await db.exec("update public.matrix_analysis_runs set status='running'");
  const health = (await db.query('select * from private.matrix_analysis_active_version_health()')).rows;
  assert.equal(health.filter(r => r.issue === 'noncomplete_run').length,2);
  await db.exec('update public.lottery_draws set draw_order_numbers=null');
  assert.deepEqual(await state(),[]); assert.deepEqual(await manifest(),[]);
  assert.equal(await active(actual),null);
});

test('manifest foreign key rejects orphan pointers and cascades source invalidation', async () => {
  await draw({order:null}); await run(); await apply();
  await db.exec('savepoint orphan');
  await assert.rejects(() => db.exec("update private.matrix_analysis_active_versions set analysis_version='absent'"), /foreign key constraint/);
  await db.exec('rollback to savepoint orphan; delete from public.matrix_analysis_runs');
  assert.deepEqual(await manifest(),[]);
});

test('caller rollback restores successful completion and activation together', async () => {
  await draw({order:null}); await run({status:'running'}); await apply();
  const before = await state(); await db.exec('savepoint completion'); assert.equal(await complete(),true);
  await db.exec('rollback to savepoint completion'); assert.deepEqual(await state(),before); assert.deepEqual(await manifest(),[]);
});

test('current acquisition and sealed owned writes integrate with completion and reject stale ownership', async () => {
  await draw({order:null}); await apply(); await db.exec('set local role service_role');
  const acquired = await acquire(); assert.equal(acquired.lease_acquired,true);
  const contender = await acquire('stale'); assert.equal(contender.lease_acquired,false);
  assert.equal(contender.lease_owner,'worker');
  assert.equal(await writeArtifacts(acquired),true);
  assert.equal(await writeArtifacts(acquired,'stale','stale'),false);
  assert.equal(await complete({owner:'stale'}),false);
  assert.equal(await complete(),true);
  assert.equal(await writeArtifacts(acquired,'worker','after-completion'),false);
  assert.equal((await acquire('replacement')).lease_acquired,false);
  await db.exec('reset role');
  assert.equal(await active(),version());
  assert.deepEqual((await db.query('select distinct payload from public.matrix_analysis_artifacts')).rows,[{payload:{marker:'current'}}]);
});

test('expired acquired ownership rejects writes and completion before replacement takeover succeeds', async () => {
  await draw({order:null}); await apply(); await db.exec('set local role service_role');
  const acquired = await acquire(); assert.equal(await writeArtifacts(acquired),true);
  await db.exec("reset role; update public.matrix_analysis_runs set lease_expires_at=clock_timestamp()-interval '1 second'");
  const before = await state(); await db.exec('set local role service_role');
  assert.equal(await writeArtifacts(acquired,'worker','expired'),false); assert.equal(await complete(),false);
  await db.exec('reset role'); assert.deepEqual(await state(),before); assert.deepEqual(await manifest(),[]);
  await db.exec('set local role service_role'); const replacement = await acquire('replacement');
  assert.equal(replacement.lease_acquired,true); assert.equal(replacement.lease_owner,'replacement');
  assert.equal(await writeArtifacts(acquired,'worker','old-owner'),false); assert.equal(await complete(),false);
  assert.equal(await writeArtifacts(replacement,'replacement','replacement'),true);
  assert.equal(await complete({owner:'replacement'}),true); await db.exec('reset role');
  assert.equal(await active(),version());
  assert.deepEqual((await db.query('select distinct payload from public.matrix_analysis_artifacts')).rows,[{payload:{marker:'replacement'}}]);
});

test('current draw ingestion preserves unchanged completion and invalidates corrected source atomically', async () => {
  await draw({order:null}); await apply(); await db.exec('set local role service_role');
  const acquired = await acquire(); assert.equal(await writeArtifacts(acquired),true); assert.equal(await complete(),true);
  const unchanged = {lottery,period,draw_date:'2026-09-12',numbers:['01','02','03','04','05'],
    sorted_numbers:['01','02','03','04','05'],draw_order_numbers:null,result_status:'confirmed'};
  await db.query('select public.matrix_upsert_draws($1)',[JSON.stringify([unchanged])]);
  await db.exec('reset role'); assert.equal(await active(),version()); await db.exec('set local role service_role');
  await db.query('select public.matrix_upsert_draws($1)',[JSON.stringify([{...unchanged,
    numbers:['01','02','03','04','06'],sorted_numbers:['01','02','03','04','06']}])]);
  assert.equal(await complete(),false); await db.exec('reset role');
  assert.deepEqual(await state(),[]); assert.deepEqual(await manifest(),[]);
  assert.equal((await db.query('select count(*)::int as count from public.matrix_analysis_artifacts')).rows[0].count,0);
});
