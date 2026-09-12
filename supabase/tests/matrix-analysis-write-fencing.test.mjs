import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const db = new PGlite();
const lottery = '今彩539';
const period = '115000220';
const version = `${period}:matrix-python-v14-sorted`;
const started = '2026-09-12T00:00:00Z';
const tables = ['matrix_analysis_artifacts', 'matrix_analysis_artifact_chunks', 'matrix_explore_results', 'matrix_tianheng_results'];

before(async () => {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema private;');
  await db.exec(read('./fixtures/matrix-analysis-tables.sql'));
  await db.exec(read('../migrations/20260825060000_matrix_analysis_artifact_chunks.sql'));
  await db.exec(read('../migrations/20260903185906_matrix_analysis_run_lease.sql'));
  await db.exec('grant select, insert, update, delete on public.matrix_explore_results, public.matrix_tianheng_results to service_role;');
  await db.exec(read('../migrations/20260912192953_matrix_analysis_owned_writes.sql'));
  await db.exec(read('../migrations/20260912193421_matrix_analysis_seal_direct_writes.sql'));
});
after(async () => db.close());
beforeEach(async () => {
  await db.exec('reset role; truncate public.matrix_analysis_runs cascade;');
  await db.query(`insert into public.matrix_analysis_runs(lottery,draw_period,analysis_version,phase,status,started_at,lease_owner,lease_expires_at)
    values ($1,$2,$3,'explore','running',$4,'replacement',clock_timestamp()+interval '5 minutes')`, [lottery, period, version, started]);
});

function record(table, marker = '06') {
  const common = {lottery, draw_period:period, analysis_version:version, expires_at:'2030-01-01T00:00:00Z'};
  if (table === tables[0]) return {...common, kind:'explore', completed_at:started, payload:{marker}};
  if (table === tables[1]) return {...common, kind:'explore', chunk_index:0, cursor_start:0, cursor_end:1, payload:{marker}};
  const result = {...common, item_id:'road-1', prediction_distance:1, consecutive:'連2', highest_streak:2,
    prediction_numbers:[marker], algorithm_type:'加減', number_order:'依號碼由小到大排序', rule_count:1,
    explore_range:'標準範圍', locked_source_index:0, locked_source_period:period, reference_offset:null,
    reference_position:null, item:{marker}, validation:{marker}};
  return table === tables[2] ? {...result, number:marker, locked_position:1}
    : {...result, first_number:marker, first_locked_position:1, second_number:'02', second_locked_position:2};
}
async function write(table, rows=[record(table)], owner='replacement', generation=started) {
  const result = await db.query(`select public.matrix_analysis_write_owned($1,$2,$3,$4,$5,$6,$7) as accepted`,
    [lottery, period, version, owner, generation, table, JSON.stringify(rows)]);
  return result.rows[0].accepted;
}
async function saved(table) {
  return (await db.query(`select ${table === tables[0] || table === tables[1] ? 'payload' : 'item'}->>'marker' as marker from public.${table}`)).rows;
}
async function restore(kind, rows=[record(`matrix_${kind}_results`)], generation=started) {
  const result = await db.query('select public.matrix_analysis_restore_results($1,$2,$3,$4,$5,$6) as accepted',
    [lottery, period, version, generation, kind, JSON.stringify(rows)]);
  return result.rows[0].accepted;
}

for (const table of tables) {
  test(`${table}: only current owner and generation can insert or replace rows`, async () => {
    await db.exec('set role service_role');
    assert.equal(await write(table), true);
    assert.equal(await write(table, [record(table,'05')], 'old-worker'), false);
    assert.equal(await write(table, [record(table,'05')], 'replacement','2026-09-11T00:00:00Z'), false);
    assert.equal(await write(table, [record(table,'05')], null), false);
    assert.equal(await write(table, [record(table,'05')], ''), false);
    assert.deepEqual(await saved(table), [{marker:'06'}]);
    assert.equal(await write(table, [record(table,'07')]), true);
    assert.deepEqual(await saved(table), [{marker:'07'}]);
  });

  test(`${table}: replacement at same version rejects old in-flight records`, async () => {
    assert.equal(await write(table, [record(table,'05')], 'replacement'), true);
    await db.exec('delete from public.matrix_analysis_runs;');
    await db.query(`insert into public.matrix_analysis_runs(lottery,draw_period,analysis_version,phase,status,started_at,lease_owner,lease_expires_at)
      values ($1,$2,$3,'explore','running',$4,'new-owner',clock_timestamp()+interval '5 minutes')`,
      [lottery, period, version, '2026-09-12T00:00:01Z']);
    await db.exec('set role service_role');
    assert.equal(await write(table, [record(table)], 'new-owner','2026-09-12T00:00:01Z'), true);
    assert.equal(await write(table, [record(table,'05')]), false);
    assert.deepEqual(await saved(table), [{marker:'06'}]);
  });

  test(`${table}: expired, complete, and missing runs cannot write`, async () => {
    assert.equal(await write(table), true);
    for (const update of ["lease_expires_at=clock_timestamp()-interval '1 second'", "lease_expires_at=clock_timestamp()+interval '5 minutes',status='complete'"]) {
      await db.exec(`update public.matrix_analysis_runs set ${update}; set role service_role;`);
      assert.equal(await write(table, [record(table,'05')]), false);
      assert.deepEqual(await saved(table), [{marker:'06'}]);
      await db.exec('reset role');
    }
    await db.exec('delete from public.matrix_analysis_runs; set role service_role;');
    assert.equal(await write(table), false);
    assert.deepEqual(await saved(table), []);
  });

  test(`${table}: malformed batch rolls back all changes`, async () => {
    await db.exec('set role service_role');
    assert.equal(await write(table), true);
    const valid = record(table,'05');
    const invalid = {...record(table,'07'), expires_at:null};
    if (table === tables[0]) invalid.kind = 'status';
    else if (table === tables[1]) invalid.chunk_index = 1;
    else invalid.item_id = 'road-2';
    await assert.rejects(() => write(table,[valid,invalid]), /null value.*expires_at/);
    assert.deepEqual(await saved(table), [{marker:'06'}]);
    await assert.rejects(() => write(table,[valid,{...invalid,lottery:'天天樂'}]), /ANALYSIS_WRITE_RECORD_SCOPE_INVALID/);
    assert.deepEqual(await saved(table), [{marker:'06'}]);
  });

  test(`${table}: sealed direct inserts and updates fail for service role`, async () => {
    await db.exec('set role service_role');
    assert.equal(await write(table), true);
    await assert.rejects(() => db.exec(`insert into public.${table} default values`), /permission denied/);
    await assert.rejects(() => db.exec(`update public.${table} set expires_at=clock_timestamp()`), /permission denied/);
    assert.deepEqual(await saved(table), [{marker:'06'}]);
  });
}

test('RPC rejects unlisted tables and malformed record containers', async () => {
  await db.exec('set role service_role');
  await assert.rejects(() => write('matrix_analysis_runs',[]), /ANALYSIS_WRITE_TARGET_INVALID/);
  await assert.rejects(() => write(tables[0],{}), /ANALYSIS_WRITE_RECORDS_INVALID/);
  await assert.rejects(() => write(tables[0],[null]), /ANALYSIS_WRITE_RECORD_SCOPE_INVALID/);
  await assert.rejects(() => write(tables[0],Array.from({length:101},() => record(tables[0]))), /ANALYSIS_WRITE_RECORDS_INVALID/);
});

test('anonymous and authenticated callers cannot execute owned writes', async () => {
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(() => write(tables[0]), /permission denied/);
    await assert.rejects(() => restore('explore'), /permission denied/);
    await db.exec('reset role');
  }
});

for (const kind of ['explore','tianheng']) {
  test(`${kind}: completed restoration preserves reads and rejects stale generations`, async () => {
    const table = `matrix_${kind}_results`;
    await write(tables[0], [{...record(tables[0]),kind}]);
    assert.equal(await restore(kind), false);
    await db.exec("update public.matrix_analysis_runs set status='complete', lease_owner=null, lease_expires_at=null; set role service_role");
    assert.equal(await restore(kind), true);
    assert.equal(await restore(kind,[record(table,'05')],'2026-09-11T00:00:00Z'), false);
    assert.deepEqual(await saved(table), [{marker:'06'}]);
    assert.deepEqual((await db.query('select status, lease_owner from public.matrix_analysis_runs')).rows,
      [{status:'complete',lease_owner:null}]);
    await db.exec(`delete from public.matrix_analysis_artifacts where kind='${kind}'`);
    assert.equal(await restore(kind,[record(table,'05')]), false);
    assert.deepEqual(await saved(table), [{marker:'06'}]);
  });
}

test('completed restoration rejects unrelated kinds and cross-scope records', async () => {
  await write(tables[0]);
  await db.exec("update public.matrix_analysis_runs set status='complete'; set role service_role");
  await assert.rejects(() => restore('status',[]), /UNKNOWN_RESULT_KIND/);
  await assert.rejects(() => restore('explore',[{...record(tables[2]), analysis_version:'other'}]), /ANALYSIS_WRITE_RECORD_SCOPE_INVALID/);
});

test('caller transaction rollback restores successful writes', async () => {
  await db.exec('begin; set local role service_role');
  assert.equal(await write(tables[0]), true);
  await db.exec('rollback');
  assert.deepEqual(await saved(tables[0]), []);
});
