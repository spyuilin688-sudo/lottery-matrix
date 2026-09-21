import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const routes = fs.readFileSync(new URL('../backend/matrix-status-routes.ts', import.meta.url), 'utf8');
const entitlements = fs.readFileSync(new URL('../backend/matrix-entitlements.ts', import.meta.url), 'utf8');

test('Matrix status consumes injected canonical entitlements instead of resolving a second copy', () => {
  assert.doesNotMatch(routes, /resolveMatrixEntitlements/);
  assert.match(routes, /resolveEntitlements\(authorization\?/);
});

test('shared entitlement module no longer owns runtime permission calculations', () => {
  assert.doesNotMatch(entitlements, /export function resolveMatrixEntitlements/);
  assert.doesNotMatch(entitlements, /taipeiWeekday/);
});
