import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);

test('Matrix status Edge dependency graph uses explicit Deno-resolvable extensions', () => {
  const visited = new Set();
  const visit = (url) => {
    if (visited.has(url.href) || url.pathname.endsWith('.json')) return;
    visited.add(url.href);
    const source = readFileSync(url, 'utf8');
    const imports = [...source.matchAll(/\b(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g)]
      .map((match) => match[1]);
    for (const specifier of imports) {
      assert.match(specifier, /\.(?:[cm]?[jt]sx?|json)$/, `${url.pathname}: ${specifier}`);
      visit(new URL(specifier, url));
    }
  };
  visit(new URL('supabase/functions/matrix-status/index.ts', root));
  assert.ok(visited.size > 5, 'the contract must inspect the full runtime graph');
  assert.ok([...visited].every((url) => !url.includes('matrix-custom-status')));
});
