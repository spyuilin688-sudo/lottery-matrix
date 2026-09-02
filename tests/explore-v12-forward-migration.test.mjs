import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260902040000_matrix_explore_v12_rpc.sql", import.meta.url),
  "utf8",
);

test("v12 RPC cutover accepts only canonical analysis rows", () => {
  assert.match(migration, /create or replace function public\.matrix_explore_list\(p_request jsonb\)/);
  assert.match(migration, /create or replace function public\.matrix_explore_validation\(p_request jsonb\)/);
  assert.match(migration, /run\.analysis_version = run\.draw_period \|\| ':matrix-python-v12'/);
  assert.match(migration, /v_version <> v_draw \|\| ':matrix-python-v12'/);
  assert.doesNotMatch(migration, /matrix-python-v1[01]/);
});

test("v12 RPC cutover preserves function security grants", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /revoke all on function public\.matrix_explore_list\(jsonb\) from public/);
  assert.match(migration, /grant execute on function public\.matrix_explore_list\(jsonb\) to anon, authenticated/);
  assert.match(migration, /revoke all on function public\.matrix_explore_validation\(jsonb\) from public/);
  assert.match(migration, /grant execute on function public\.matrix_explore_validation\(jsonb\) to anon, authenticated/);
});

test("RPC cutover does not delete results before v12 production verification", () => {
  assert.doesNotMatch(migration, /delete\s+from/i);
});
