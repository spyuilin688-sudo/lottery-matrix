import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/20260903185906_matrix_analysis_run_lease.sql", import.meta.url);

test("matrix analysis run lease is atomic and service-role only", () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /add column if not exists lease_owner text/i);
  assert.match(sql, /add column if not exists lease_expires_at timestamptz/i);
  assert.match(sql, /create or replace function public\.matrix_analysis_acquire_run/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /create or replace function public\.matrix_analysis_renew_lease/i);
  assert.match(sql, /coalesce\(auth\.role\(\),\s*''\)\s*<>\s*'service_role'/i);
  assert.match(sql, /revoke execute on function public\.matrix_analysis_acquire_run/i);
  assert.match(sql, /grant execute on function public\.matrix_analysis_acquire_run[\s\S]*to service_role/i);
  assert.match(sql, /grant execute on function public\.matrix_analysis_renew_lease[\s\S]*to service_role/i);
});
