import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const responsive = readFileSync('src/responsive-feature-pages.css', 'utf8');
const shared = readFileSync('src/feature-pages.css', 'utf8');
const tokens = readFileSync('src/design-tokens.css', 'utf8');

test('tool settings float from the shared sticky header with 16px inline insets', () => {
  const match = shared.match(/\.product-header__settings-card\[data-floating="true"\]\s*\{([^}]*)\}/);
  const block = match?.[1] ?? '';
  assert.ok(match, 'BrandHeader owns the floating card for all three tools');
  assert.match(block, /position:\s*absolute;/);
  assert.match(block, /top:\s*0;/);
  assert.match(block, /inset-inline:\s*var\(--layout-page-inline\);/);
  assert.match(tokens, /--layout-page-inline:\s*16px;/);
  assert.match(shared, /\.sticky-title-card-screen > \.product-header,\s*\.number-reference-screen > \.product-header\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/s);
});

test('history floating settings card has no legacy floating controller', () => {
  for (const css of [shared, responsive]) {
    assert.doesNotMatch(css, /\.(?:history-filter-panel|reference-query-panel|tongxing-query)\[data-floating="true"\]/);
  }
});
