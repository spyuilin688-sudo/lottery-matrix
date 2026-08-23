import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync('src/feature-pages.css', 'utf8');
const tokens = readFileSync('src/design-tokens.css', 'utf8');

test('status colors use the existing Matrix status tokens', () => {
  assert.match(tokens, /--matrix-status-critical:\s*var\(--lottery-status-critical\)/);
  assert.match(css, /\.status-block\s*\{[^}]*--tone:\s*var\(--matrix-status-critical\);[^}]*--border:\s*var\(--matrix-status-critical-border\)/s);
  assert.match(css, /\.status-block\[data-tone="purple"\]\s*\{[^}]*var\(--matrix-status-resonance\)/s);
  assert.match(css, /\.status-block\[data-tone="blue"\]\s*\{[^}]*var\(--matrix-status-focus\)/s);
  assert.match(css, /\.status-block\[data-tone="green"\]\s*\{[^}]*var\(--matrix-status-active\)/s);
});

test('status summary cards have one formal layout source', () => {
  assert.match(css, /\.status-list\s*\{[^}]*gap:\s*10px/s);
  assert.match(css, /\.status-block > button\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto 18px;[^}]*gap:\s*8px/s);
  assert.doesNotMatch(css, /\.matrix-status-screen \.status-list\s*\{/);
  assert.doesNotMatch(css, /\.matrix-status-screen \.status-block > button\s*\{/);
});

test('six-column status result table is fluid and readable on mobile', () => {
  assert.match(css, /\.matrix-status-screen \.status-road-table-head,\s*\.matrix-status-screen \.status-road-table-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, \.86fr\) minmax\(0, \.62fr\) minmax\(0, \.9fr\) minmax\(0, 1\.16fr\) minmax\(0, \.82fr\) minmax\(0, 1\.04fr\)/s);
  assert.match(css, /\.matrix-status-screen \.status-road-table-row\s*\{[^}]*font-size:\s*clamp\(10\.5px, 2\.8vw, 12px\)/s);
  assert.match(css, /\.matrix-status-screen \.status-road-table-row > span:last-child\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere/s);
  assert.doesNotMatch(css, /grid-template-columns:\s*1\.02fr \.7fr 1\.05fr 1\.25fr \.72fr 1\.04fr/);
});
