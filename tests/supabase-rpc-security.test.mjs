import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Matrix entitlements fail closed for a missing paid-plan expiry', async () => {
  const sql = await read('supabase/migrations/20260829093000_matrix_result_rpc.sql');
  assert.match(
    sql,
    /v_paid\s*:=\s*v_plan\s*<>\s*'free'\s+and\s+pg_catalog\.coalesce\(v_member\.plan_expires_at\s*>\s*pg_catalog\.now\(\),\s*false\)/s,
  );
});

test('member RPCs require a non-suspended member', async () => {
  const sql = await read('supabase/migrations/20260829090000_member_pwa_rpc.sql');
  assert.match(sql, /create or replace function private\.active_member_id\(\)/);
  assert.ok((sql.match(/private\.active_member_id\(\)/g) ?? []).length >= 6);
  assert.match(sql, /coalesce\(v_member\.status, ''\) in \('停用', 'disabled', 'inactive'\)/);
});

test('raw Matrix status RPC is not executable by browsers', async () => {
  const sql = await read('supabase/migrations/20260829093000_matrix_result_rpc.sql');
  assert.match(sql, /revoke all on function public\.matrix_status_get\(jsonb\) from public, anon, authenticated/);
  assert.doesNotMatch(sql, /grant execute on function public\.matrix_status_get\(jsonb\) to anon, authenticated/);
  assert.match(sql, /revoke all on function public\.matrix_status_sources_get\(jsonb\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.matrix_status_sources_get\(jsonb\) to service_role/);
});

test('Matrix status source RPC reads the compact status artifact only', async () => {
  const sql = await read('supabase/migrations/20260829194000_compact_matrix_status_sources.sql');
  const section = sql.match(/create or replace function public\.matrix_status_sources_get\(p_request jsonb\)[\s\S]*?\n\$\$;/)?.[0] ?? '';
  assert.match(section, /private\.matrix_artifact_payload\('status', v_lottery, v_draw, v_version\)/);
  assert.match(section, /v_payload->'statusSources'/);
  assert.doesNotMatch(section, /matrix_artifact_payload\('explore'/);
  assert.doesNotMatch(section, /matrix_artifact_payload\('tianyan'/);
});

test('legacy completed status artifacts are backfilled without validation maps', async () => {
  const sql = await read('supabase/migrations/20260829195500_backfill_compact_matrix_status_sources.sql');
  assert.match(sql, /status\.payload->'statusSources' is null/);
  assert.match(sql, /chunk\.kind in \('explore', 'tianyan'\)/);
  assert.match(sql, /jsonb_set\(status\.payload, '\{statusSources\}'/);
  assert.doesNotMatch(sql, /validationById/);
  assert.match(sql, /encoded\.payload->>'encoding' is not null/);
});

test('Matrix Explore RPCs preserve complete-only security and cut over only to matrix-python-v8', async () => {
  const baseSql = await read('supabase/migrations/20260831213000_matrix_python_v7_explore_rpc.sql');
  const upgradeSql = await read('supabase/migrations/20260901000000_matrix_python_v8_explore_rpc.sql');
  const exploreList = baseSql.match(/create or replace function public\.matrix_explore_list\(p_request jsonb\)[\s\S]*?\n\$\$;/)?.[0] ?? '';
  const exploreValidation = baseSql.match(/create or replace function public\.matrix_explore_validation\(p_request jsonb\)[\s\S]*?\n\$\$;/)?.[0] ?? '';

  assert.equal((baseSql.match(/create or replace function/g) ?? []).length, 2);
  assert.match(exploreList, /run\.status\s*=\s*'complete'/);
  assert.match(exploreValidation, /run\.status\s*=\s*'complete'/);
  assert.match(upgradeSql, /pg_catalog\.pg_get_functiondef\(v_function_oid\)/);
  assert.match(upgradeSql, /p\.proname in \('matrix_explore_list', 'matrix_explore_validation'\)/);
  assert.match(upgradeSql, /'matrix-python-v7',\s*'matrix-python-v8'/s);
  assert.match(upgradeSql, /MATRIX_EXPLORE_RPC_COUNT_INVALID/);
  assert.match(upgradeSql, /MATRIX_PYTHON_V7_RPC_REFERENCE_REMAINS/);
  assert.match(upgradeSql, /MATRIX_PYTHON_V8_RPC_REFERENCE_MISSING/);
  assert.doesNotMatch(upgradeSql, /matrix-python-v[56]/);
});

test('deployed functions repair invalid schema-qualified COALESCE calls', async () => {
  const sql = await read('supabase/migrations/20260831235800_repair_qualified_coalesce.sql');

  assert.match(sql, /n\.nspname in \('public', 'private'\)/);
  assert.match(sql, /p\.prokind = 'f'/);
  assert.match(
    sql,
    /position\(\s*'pg_catalog\.coalesce'\s+in pg_catalog\.lower\(pg_catalog\.pg_get_functiondef\(p\.oid\)\)\s*\) > 0/s,
  );
  assert.match(
    sql,
    /pg_catalog\.replace\(v_definition, 'pg_catalog\.coalesce', 'coalesce'\)/,
  );
  assert.match(sql, /execute v_definition/);
  assert.match(sql, /BROKEN_QUALIFIED_COALESCE_REMAINS/);
});


test('Matrix historical date offsets are limited to the restored three periods', async () => {
  const sql = await read('supabase/migrations/20260901010000_restore_matrix_explore_date_offsets.sql');

  assert.match(sql, /v_offset is null or v_offset not in \(0, 1, 2\)/);
  assert.match(sql, /offset v_offset/);
  assert.match(sql, /'exploreDateOffset', v_offset/);
  assert.match(sql, /create or replace function public\.matrix_tianyan_list\(p_request jsonb\)/);
  assert.match(sql, /v_offset integer := coalesce\(\(p_request->>'exploreDateOffset'\)::integer, 0\)/);
  assert.match(sql, /v_offset not in \(0, 1, 2\)/);
});
