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
