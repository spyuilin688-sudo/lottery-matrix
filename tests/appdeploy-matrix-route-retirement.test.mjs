import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const backendIndex = fs.readFileSync(new URL('../backend/index.ts', import.meta.url), 'utf8');

test('legacy AppDeploy Matrix algorithm and status routes are not wired', () => {
  assert.doesNotMatch(backendIndex, /\/api\/matrix\/algorithm\/tianyan/);
  assert.doesNotMatch(backendIndex, /\/api\/matrix\/algorithm\/tiangong/);
  assert.doesNotMatch(backendIndex, /\/api\/matrix\/status/);
  assert.doesNotMatch(backendIndex, /createMatrix(?:Tianyan|Tiangong|Status)Routes/);
});
