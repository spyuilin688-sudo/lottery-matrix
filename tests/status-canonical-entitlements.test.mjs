import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const routes = fs.readFileSync(new URL('../backend/matrix-status-routes.ts', import.meta.url), 'utf8');
const edge = fs.readFileSync(new URL('../supabase/functions/matrix-status/index.ts', import.meta.url), 'utf8');
const reader = fs.readFileSync(new URL('../supabase/functions/matrix-status/source-reader.ts', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20260921172000_matrix_status_canonical_entitlements.sql', import.meta.url), 'utf8');

test('production Matrix status injects canonical Supabase entitlements', () => {
  assert.match(routes, /resolveEntitlements\(authorization\?: string\): Promise<MatrixEntitlements>/);
  assert.doesNotMatch(routes, /resolveEntitlements\?\(/);
  assert.match(edge, /resolveEntitlements:/);
  assert.match(edge, /createMatrixStatusEntitlementReader/);
  assert.doesNotMatch(edge, /createMemberAuth|requireMember:/);
  assert.match(reader, /rpc\/matrix_status_entitlements/);
});

test('status entitlement RPC delegates to the canonical private resolver', () => {
  assert.match(migration, /private\.matrix_result_entitlements\(\)/);
  assert.doesNotMatch(migration, /registered_member_free_access|member_login_perks_eligible|v_referrals/);
});


test('compact homepage summaries do not resolve member entitlements', () => {
  const compactBranch = routes.slice(routes.indexOf('async summary('), routes.indexOf('async get('));
  const compactRead = compactBranch.slice(compactBranch.indexOf('if (dependencies.readCompactStatus)'), compactBranch.indexOf('const entitlements ='));
  assert.doesNotMatch(compactRead, /entitlementsFor|resolveEntitlements|requireMember/);
});
