import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath = new URL('../supabase/migrations/20260921074825_retire_legacy_explore_entitlements.sql', import.meta.url);
const sql = fs.readFileSync(migrationPath, 'utf8');

test('retires the legacy public explore entitlement resolver', () => {
  assert.match(sql, /drop function if exists public\.matrix_explore_entitlements\(\)/i);
});

test('does not replace the canonical private entitlement resolver', () => {
  assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+private\.matrix_result_entitlements/i);
});
