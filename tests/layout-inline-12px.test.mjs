import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tokens = readFileSync('src/design-tokens.css', 'utf8');
const features = readFileSync('src/feature-pages.css', 'utf8');
const tongxing = readFileSync('src/tongxing-compact.css', 'utf8');
const home = readFileSync('src/homepage-repair.css', 'utf8');

test('mobile page content uses the formal 12px inline spacing token', () => {
  assert.match(tokens, /--layout-page-inline:\s*12px;/);
  assert.doesNotMatch(features, /\.feature-body\s*\{[^}]*padding-inline:\s*(?:4|10|14)px;/s);
  assert.doesNotMatch(features, /(?:matrix-notebook|matrix-status|notes|note-detail|profile|profile-detail|activation-code|number-reference|draw-history|matrix-explore-main|matrix-tianyan|matrix-tiangong)-screen[^\{]*\.feature-body[^\{]*\{[^}]*padding-inline:\s*(?:4|10|14)px;/s);
  assert.doesNotMatch(tongxing, /\.tongxing-screen\s*>\s*\.feature-body\s*\{[^}]*padding-(?:left|right):\s*4px;/s);
});

test('homepage uses one 12px page-edge source without compensatory child stretching', () => {
  assert.match(home, /\.home-screen \.lottery-screen\s*\{[^}]*padding:\s*0 var\(--layout-page-inline\);/s);
  assert.doesNotMatch(home, /--home-main-inline:\s*16px;/);
  assert.doesNotMatch(home, /--home-wide-inline:\s*6px;/);
  assert.match(home, /\.home-screen \.lottery-switcher\s*\{[^}]*width:\s*100%;[^}]*margin-inline:\s*0;/s);
  assert.match(home, /\.home-screen \.matrix-status-section\s*\{[^}]*width:\s*100%;/s);
  assert.match(home, /\.home-screen \.matrix-status-section > \.home-asset-image\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;/s);
  assert.match(home, /\.home-screen \.home-shortcut-row\s*\{[^}]*width:\s*100%;/s);
});
