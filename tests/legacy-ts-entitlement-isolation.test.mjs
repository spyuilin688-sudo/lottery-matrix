import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../backend/index.ts', import.meta.url), 'utf8');
const tianyan = fs.readFileSync(new URL('../backend/matrix-tianyan-routes.ts', import.meta.url), 'utf8');
const tiangong = fs.readFileSync(new URL('../backend/matrix-tiangong-routes.ts', import.meta.url), 'utf8');

test('retired AppDeploy Matrix routes remain unreachable from the backend entrypoint', () => {
  assert.doesNotMatch(index, /createMatrix(?:Tianyan|Tiangong|Status)Routes/);
  assert.doesNotMatch(index, /\/api\/matrix\/(?:algorithm|status)/);
});

test('remaining legacy route modules are isolated compatibility code only', () => {
  assert.match(tianyan, /resolveMatrixEntitlements/);
  assert.match(tiangong, /resolveMatrixEntitlements/);
});
