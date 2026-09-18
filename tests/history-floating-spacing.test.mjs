import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const responsive = readFileSync('src/responsive-feature-pages.css', 'utf8');
const legacy = readFileSync('src/feature-pages.css', 'utf8');

test('tool floating settings cards share a portal-safe 16px inline offset', () => {
  const match = responsive.match(/\.history-filter-panel\[data-floating="true"\],\s*\.reference-query-panel\[data-floating="true"\],\s*\.tongxing-query\[data-floating="true"\]\s*\{([\s\S]*?)\}/);
  const block = match?.[1] ?? '';
  assert.ok(match, 'the three floating panels must use one shared formal controller');
  assert.match(block, /\bleft:\s*16px\s*;/);
  assert.match(block, /\bright:\s*16px\s*;/);
});

test('history floating settings card has no legacy floating controller', () => {
  assert.doesNotMatch(legacy, /\.history-filter-panel\[data-floating="true"\]\s*\{/);
});
