import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const status = read('src/feature-pages.css');
const preview = read('src/explore-result-preview.css');
const refinements = read('src/matrix-explore-result-refinements.css');

test('all status cards use 13px page gutters without moving lottery controls', () => {
  assert.match(read('src/design-tokens.css'), /--layout-page-inline:\s*16px;/);
  assert.match(status, /\.matrix-status-screen \.status-list\s*\{[^}]*margin-inline:\s*-3px;/);
  assert.match(status, /\.matrix-status-screen \.explore-validation-card\s*\{[^}]*margin-inline:\s*6px;/);
  assert.equal(16 - 3, 13);
});

test('status shares every Explore-specific validation declaration', () => {
  for (const css of [preview, refinements]) {
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (!selectors.includes('.matrix-explore-main-screen') || !selectors.includes('validation')) continue;
      const explore = selectors.slice(selectors.indexOf('.matrix-explore-main-screen'));
      const expected = explore.replace(/\.matrix-explore-main-screen(?::not\(\.[\w-]+\))*/g, '.matrix-status-screen');
      for (const selector of expected.split(/,\s*\n(?=\.)/)) {
        assert.ok(selectors.includes(selector), `Missing shared status selector: ${selector}`);
      }
    }
  }
});

test('status uses Explore alternating groups, 12px block padding and 15px results', () => {
  assert.match(preview, /\.matrix-status-screen \.explore-validation-group:nth-child\(odd\)[^{]*\{[^}]*#152A42/);
  assert.match(preview, /\.matrix-status-screen \.explore-validation-group:nth-child\(even\)[^{]*\{[^}]*#0E1D30/);
  assert.match(preview, /\.matrix-status-screen \.explore-validation-card[^{]*\{[^}]*padding-block:\s*12px;/);
  assert.match(refinements, /\.matrix-status-screen\s+\.explore-validation-card \.explore-validation-result-number[^{]*\{[^}]*font-size:\s*15px;/);
});
