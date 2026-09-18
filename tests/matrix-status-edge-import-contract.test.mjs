import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../backend/matrix-custom-status-routes.ts', import.meta.url),
  'utf8',
);

test('Matrix status Edge dependencies use explicit Deno-resolvable extensions', () => {
  const relativeImports = [...source.matchAll(/\\bfrom\\s+['"](\\.[^'"]+)['"]/g)]
    .map((match) => match[1]);
  const extensionless = relativeImports.filter(
    (specifier) => !/\\.(?:[cm]?[jt]sx?|json)$/.test(specifier),
  );

  assert.deepEqual(extensionless, []);
});
