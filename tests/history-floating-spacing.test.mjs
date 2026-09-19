import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const responsive = readFileSync('src/responsive-feature-pages.css', 'utf8');
const legacy = readFileSync('src/feature-pages.css', 'utf8');

test('tool floating settings share one header-owned 16px inline offset', () => {
  const match = legacy.match(/\.product-header__settings-card\[data-floating="true"\]\s*\{([\s\S]*?)\}/);
  const block = match?.[1] ?? '';
  assert.ok(match, 'the three floating panels must use one shared formal controller');
  assert.match(block, /position:\s*absolute;/);
  assert.match(block, /top:\s*0;/);
  assert.match(block, /inset-inline:\s*var\(--layout-page-inline\);/);
  assert.match(readFileSync('src/design-tokens.css', 'utf8'), /--layout-page-inline:\s*16px;/);
  assert.match(legacy, /\.product-header\[data-settings-floating="true"\]\s*\{\s*height:\s*68px;/);
  for (const css of [responsive, legacy]) assert.doesNotMatch(css, /\.(?:history-filter-panel|reference-query-panel|tongxing-query)\[data-floating="true"\]/);
});

test('history floating settings card has no legacy floating controller', () => {
  assert.doesNotMatch(legacy, /\.history-filter-panel\[data-floating="true"\]\s*\{/);
});
