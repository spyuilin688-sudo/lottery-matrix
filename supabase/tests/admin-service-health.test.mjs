import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const read = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const fn = (sql, name) => sql.match(new RegExp(`create(?: or replace)? function ${name.replaceAll('.', '\\.')}\\([\\s\\S]*?\\$\\$;`, 'i'))[0];
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema private;
    create table public.lottery_draws(lottery text,period text,draw_date date,numbers jsonb,draw_order_numbers jsonb,result_status text);
    create table public.matrix_analysis_runs(lottery text,draw_period text,analysis_version text,status text);
    create table private.matrix_analysis_active_versions(lottery text,draw_period text,analysis_version text,number_order text);
    create table public.matrix_analysis_artifacts(lottery text,draw_period text,analysis_version text,kind text,payload jsonb);
    create table public.matrix_analysis_artifact_chunks(lottery text,draw_period text,analysis_version text,kind text,chunk_index int,payload jsonb);
    create table public.matrix_custom_status_configs(updated_at timestamptz);
    create table private.matrix_permission_settings(revision int,updated_at timestamptz);
    create table public.members(registered_at timestamptz);
    create table private.line_pwa_handoff_diagnostics(created_at timestamptz);
    create table public.notification_settings(updated_at timestamptz);
    create table public.transfer_requests(submitted_at timestamptz);
    create table public.member_push_subscriptions(enabled boolean,updated_at timestamptz);
    create table public.member_online_sessions(started_at timestamptz,ended_at timestamptz);
    create table public.activation_codes(redeemed_at timestamptz);
    create table public.matrix_watchdog_leases(acquired_at timestamptz,recovery_started_at timestamptz);
    create table public.notification_events(source text,created_at timestamptz);
    create table public.notification_outbox(status text,attempt_count int,updated_at timestamptz,processed_at timestamptz,processing_started_at timestamptz);`);
  const active = read('20260912230514_matrix_analysis_active_versions.sql');
  for (const name of ['matrix_analysis_draw_order_eligible', 'matrix_analysis_active_version']) await db.exec(fn(active, `private.${name}`));
  await db.exec(fn(read('20260912164938_matrix_order_analysis_reads.sql'), 'private.matrix_analysis_read_period'));
  await db.exec(fn(read('20260913031818_matrix_analysis_retention_v2.sql'), 'private.matrix_analysis_order_version'));
  // The deployed helper includes the existing pg_catalog.coalesce repair.
  await db.exec(fn(read('20260829093000_matrix_result_rpc.sql'), 'private.matrix_artifact_payload').replaceAll('pg_catalog.coalesce', 'coalesce'));
  await db.exec(read('20260913171551_admin_service_health_evidence.sql'));
});
after(() => db.close());
beforeEach(async () => {
  await db.exec('reset role; truncate public.lottery_draws,public.matrix_analysis_runs,private.matrix_analysis_active_versions,public.matrix_analysis_artifacts,public.matrix_analysis_artifact_chunks,public.notification_outbox');
  for (const lottery of ['今彩539','天天樂','六合彩','大樂透']) {
    await db.query("insert into lottery_draws(lottery,period,draw_date) values($1,'123','2026-09-13')", [lottery]);
    await db.query("insert into matrix_analysis_runs values($1,'123','123:matrix-python-v15-sorted','complete')", [lottery]);
    await db.query("insert into private.matrix_analysis_active_versions values($1,'123','123:matrix-python-v15-sorted','sorted')", [lottery]);
    for (const kind of ['tianyan','tiangong']) await db.query("insert into matrix_analysis_artifacts values($1,'123','123:matrix-python-v15-sorted',$2,$3)", [lottery,kind,JSON.stringify({lottery,drawPeriod:'123',numberOrder:'依號碼由小到大排序',items:[{id:'sample',numberOrder:'依號碼由小到大排序'}],validationById:{sample:{itemId:'sample',rules:[{},{}],evidence:{}}}})]);
  }
});
const probe = async (kind='tianyan') => (await db.query('select * from public.admin_matrix_result_probe($1)',[kind])).rows;

test('uses the active resolver and reads four lotteries without exposing predictions or member data', async () => {
  await db.exec('set role service_role');
  const rows=await probe(); assert.equal(rows.length,4);
  assert.ok(rows.every(r=>r.list_ok && r.validation_ok && r.records===1 && r.analysis_version==='123:matrix-python-v15-sorted'));
  assert.ok(!JSON.stringify(rows).includes('sample')); assert.ok(!JSON.stringify(rows).includes('validationById'));
});
test('cannot be called by anonymous or member roles and rejects other kinds', async () => {
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`); await assert.rejects(probe(), /permission denied/); 
    await assert.rejects(db.query('select * from public.admin_service_operation_evidence()'), /permission denied/);
    await db.exec('reset role');
  }
  await assert.rejects(probe('status'),/INVALID_PROBE_KIND/);
  await assert.rejects(probe(null),/INVALID_PROBE_KIND/);
});
test('running active pointers and missing artifacts fail data verification', async () => {
  await db.exec("update matrix_analysis_runs set status='running' where lottery='今彩539'; delete from matrix_analysis_artifacts where lottery='六合彩' and kind='tianyan'");
  const rows=await probe(); assert.equal(rows.filter(r=>r.list_ok).length,2);
  assert.equal(rows.find(r=>r.lottery==='今彩539').list_ok,false);
});
test('empty lists do not claim a validation sample passed', async () => {
  await db.exec(`update matrix_analysis_artifacts set payload=jsonb_set(payload,'{items}','[]')`);
  assert.ok((await probe()).every(r=>r.list_ok && r.records===0 && r.validation_ok===null));
});
test('missing and mismatched validation data fail independently from a readable list', async () => {
  await db.exec(`update matrix_analysis_artifacts set payload=jsonb_set(payload,'{validationById}','{}') where lottery='今彩539';
    update matrix_analysis_artifacts set payload=jsonb_set(payload,'{validationById,sample,itemId}','"other"') where lottery='六合彩'`);
  const rows=await probe(); assert.ok(rows.every(r=>r.list_ok)); assert.equal(rows.filter(r=>r.validation_ok).length,2);
});
test('malformed Tianyan order is a data failure while valid legacy mixed orders remain readable', async () => {
  await db.exec(`update matrix_analysis_artifacts set payload=jsonb_set(payload,'{items}','[{"id":"sample"}]') where lottery='今彩539';
    update matrix_analysis_artifacts set payload=jsonb_set(payload,'{items}',payload->'items'||'[{"id":"draw-sample","numberOrder":"依實際開獎順序排序"}]'::jsonb) where lottery='六合彩'`);
  const rows=await probe(); assert.equal(rows.find(r=>r.lottery==='今彩539').list_ok,false);
  assert.equal(rows.find(r=>r.lottery==='六合彩').records,1); assert.equal(rows.find(r=>r.lottery==='六合彩').validation_ok,true);
});
test('Tiangong requires the sorted payload and an evidence object', async () => {
  await db.exec(`update matrix_analysis_artifacts set payload=jsonb_set(payload,'{numberOrder}','"依實際開獎順序排序"') where lottery='今彩539';
    update matrix_analysis_artifacts set payload=jsonb_set(payload,'{validationById,sample,evidence}','null') where lottery='六合彩'`);
  const rows=await probe('tiangong'); assert.equal(rows.find(r=>r.lottery==='今彩539').list_ok,false); assert.equal(rows.find(r=>r.lottery==='六合彩').validation_ok,false);
});
test('reads chunked Tianyan through the canonical reader and fails when chunks are missing', async () => {
  await db.exec(`insert into matrix_analysis_artifact_chunks select lottery,draw_period,analysis_version,kind,0,payload from matrix_analysis_artifacts where kind='tianyan';
    update matrix_analysis_artifacts set payload='{"storage":"chunks","chunkCount":1,"cursor":99,"total":99,"itemCount":1}' where kind='tianyan'`);
  assert.ok((await probe()).every(r=>r.list_ok && r.validation_ok && r.records===1));
  await db.exec("delete from matrix_analysis_artifact_chunks where lottery='六合彩'");
  assert.equal((await probe()).find(r=>r.lottery==='六合彩').list_ok,false);
});
test('operation evidence reports stored timestamps and null absence without performing notification writes', async () => {
  await db.exec("insert into notification_outbox(status,processed_at) values ('skipped','2026-09-13T10:00:00Z'),('skipped','2026-09-12T10:00:00Z')");
  const rows=(await db.query('select * from public.admin_service_operation_evidence()')).rows;
  assert.equal(new Date(rows.find(r=>r.rpc_name==='notification_dispatch_mark_skipped').observed_at).toISOString(),'2026-09-13T10:00:00.000Z');
  assert.equal(rows.find(r=>r.rpc_name==='notification_dispatch_mark_failed').observed_at,null);
  assert.equal((await db.query('select count(*)::int as n from notification_outbox')).rows[0].n,2);
});
test('includes administrator notices submitted through the same notification enqueue RPC', async () => {
  await db.exec("insert into notification_events(source,created_at) values ('admin','2026-09-13T11:00:00Z')");
  const rows=(await db.query('select * from public.admin_service_operation_evidence()')).rows;
  assert.equal(new Date(rows.find(r=>r.rpc_name==='notification_event_enqueue_server').observed_at).toISOString(),'2026-09-13T11:00:00.000Z');
});
