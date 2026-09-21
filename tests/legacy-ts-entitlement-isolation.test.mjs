import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../backend/index.ts', import.meta.url), 'utf8');
const statusRoutes = fs.readFileSync(new URL('../backend/matrix-status-routes.ts', import.meta.url), 'utf8');
const entitlements = fs.readFileSync(new URL('../backend/matrix-entitlements.ts', import.meta.url), 'utf8');

test('retired AppDeploy Matrix routes remain unreachable from the backend entrypoint', () => {
  assert.doesNotMatch(index, /createMatrix(?:Tianyan|Tiangong|Status)Routes/);
  assert.doesNotMatch(index, /\/api\/matrix\/(?:algorithm|status)/);
});

test('production status route requires injected canonical entitlements', () => {
  assert.match(statusRoutes, /resolveEntitlements\(authorization\?: string\): Promise<MatrixEntitlements>/);
  assert.doesNotMatch(statusRoutes, /resolveMatrixEntitlements/);
});

test('shared entitlement module contains types only, not a second runtime rules engine', () => {
  assert.doesNotMatch(entitlements, /resolveMatrixEntitlements|taipeiWeekday|isTuesdayOrFriday|isMondayOrThursday/);
});
