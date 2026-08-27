import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readLocalCss } from './helpers/read-local-css.mjs';

const tokens = readFileSync('src/design-tokens.css', 'utf8');
const features = readFileSync('src/feature-pages.css', 'utf8');
const tongxing = readFileSync('src/tongxing-compact.css', 'utf8');
const home = readLocalCss('src/homepage-repair.css');

test('feature page content uses the formal 16px inline spacing token', () => {
  assert.match(tokens, /--layout-page-inline:\s*16px;/);
  assert.doesNotMatch(features, /\.feature-body\s*\{[^}]*padding-inline:\s*(?:4|10|14)px;/s);
  assert.doesNotMatch(features, /(?:matrix-notebook|matrix-status|notes|note-detail|profile|profile-detail|activation-code|number-reference|draw-history|matrix-explore-main|matrix-tianyan|matrix-tiangong)-screen[^\{]*\.feature-body[^\{]*\{[^}]*padding-inline:\s*(?:4|10|14)px;/s);
  assert.doesNotMatch(tongxing, /\.tongxing-screen\s*>\s*\.feature-body\s*\{[^}]*padding-(?:left|right):\s*4px;/s);
});

test('homepage components retain their independent widths and spacing', () => {
  assert.match(home, /\.home-screen \.lottery-screen\s*\{[^}]*padding:\s*0 var\(--layout-page-inline\);/s);
  assert.doesNotMatch(home, /--home-main-inline:\s*16px;/);
  assert.doesNotMatch(home, /--home-wide-inline:\s*6px;/);
  assert.match(home, /\.lottery-switcher--home-style\s*\{[^}]*width:\s*100%;[^}]*margin-inline:\s*0;/s);
  assert.match(home, /\.home-screen \.matrix-status-section\s*\{[^}]*width:\s*calc\(min\(100vw, 390px\) - 32px\);/s);
  assert.match(home, /\.home-screen \.matrix-status-card-grid\s*\{[^}]*width:\s*100%;[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s);
  assert.match(home, /\.home-screen \.matrix-status-artwork\s*\{[^}]*width:\s*100%;[^}]*height:\s*auto;/s);
  assert.doesNotMatch(home, /\.matrix-status-section > \.home-asset-image/);
  assert.match(home, /\.home-screen \.matrix-core-banner\s*\{[^}]*width:\s*var\(--home-core-width\);/s);
  assert.match(home, /\.home-screen \.home-shortcut-row\s*\{[^}]*width:\s*calc\(100% - 24px\);[^}]*margin-inline:\s*auto;/s);
});
