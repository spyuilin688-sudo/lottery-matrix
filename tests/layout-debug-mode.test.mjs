import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const debugModulePath = new URL('../src/layout-debug.ts', import.meta.url);

test('global layout debug overlay is removed', () => {
  assert.doesNotMatch(index, /installLayoutDebugMode|layout-debug/);
  assert.equal(existsSync(debugModulePath), false);
});
