import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const debugModulePath = new URL('../src/layout-debug.ts', import.meta.url);

test('layout debug mode is wired from main and remains query-gated', () => {
  assert.match(main, /installLayoutDebugMode/);
  const debugSource = readFileSync(debugModulePath, 'utf8');
  assert.match(debugSource, /layoutDebug/);
  assert.match(debugSource, /matrix-explore-main-screen/);
  assert.match(debugSource, /getBoundingClientRect/);
  assert.match(debugSource, /getComputedStyle/);
});
