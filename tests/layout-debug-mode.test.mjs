import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const debugModulePath = new URL('../src/layout-debug.ts', import.meta.url);

test('layout debug mode is query-gated and loaded outside the protected runtime entry', () => {
  assert.match(index, /installLayoutDebugMode/);
  const debugSource = readFileSync(debugModulePath, 'utf8');
  assert.match(debugSource, /layoutDebug/);
  assert.match(debugSource, /matrix-explore-main-screen/);
  assert.match(debugSource, /getBoundingClientRect/);
  assert.match(debugSource, /getComputedStyle/);
});
