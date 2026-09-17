import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const prototypeSource = readFileSync(new URL('../src/Prototype.tsx', import.meta.url), 'utf8');
const statusApiSource = readFileSync(new URL('../src/matrix-status-api.ts', import.meta.url), 'utf8');

test('homepage forwards the deadline AbortSignal into the matrix status request', () => {
  assert.match(
    prototypeSource,
    /withDeadline\(\(requestSignal\) => fetchMatrixStatus\(id, requestSignal\), \{ signal \}\)/,
  );
  assert.match(
    statusApiSource,
    /functions\.invoke\('matrix-status', \{[\s\S]*?body,[\s\S]*?signal,[\s\S]*?\}\)/,
  );
});

test('quick target storage failures are contained without changing navigation flow', () => {
  assert.match(
    prototypeSource,
    /useState<ScreenId \| null>\(\(\) => \{[\s\S]*?try \{[\s\S]*?localStorage\.getItem\("matrix-quick-target"\)[\s\S]*?\} catch \{[\s\S]*?return null;[\s\S]*?\}/,
  );
  assert.match(
    prototypeSource,
    /const selectQuickTarget = \(next: ScreenId\)[\s\S]*?try \{[\s\S]*?localStorage\.setItem\("matrix-quick-target", next\);[\s\S]*?\} catch \{[\s\S]*?\}/,
  );
});
