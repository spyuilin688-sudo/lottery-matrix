import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('feature pages use one 16px global inline spacing source while homepage stays 12px', () => {
  const tokens = read('src/design-tokens.css');
  const home = read('src/homepage/base.css');
  const responsive = read('src/responsive-feature-pages.css');
  const explore = read('src/matrix-explore-spacing.css');
  const adjustments = read('src/feature-page-adjustments.css');
  const featurePages = read('src/feature-pages.css');

  assert.match(tokens, /--layout-page-inline:\s*16px;/);
  assert.match(home, /\.home-screen \.lottery-screen\s*\{[^}]*--layout-page-inline:\s*12px;/s);

  assert.match(responsive, /--tool-page-inline:\s*var\(--layout-page-inline\);/);
  assert.match(responsive, /left:\s*var\(--tool-page-inline\);/);
  assert.match(responsive, /right:\s*var\(--tool-page-inline\);/);

  assert.match(explore, /padding:\s*0 var\(--layout-page-inline\) var\(--layout-bottom-nav-clearance\);/);
  assert.match(explore, /width:\s*calc\(100% - \(var\(--layout-page-inline\) \* 2\)\);/);

  assert.match(adjustments, /\.notifications-screen-v2 \.feature-body\s*\{[^}]*padding:\s*0 var\(--layout-page-inline\)/s);
  assert.doesNotMatch(adjustments, /\.profile-screen \.feature-body\s*\{\s*padding-inline:\s*16px;/s);

  assert.doesNotMatch(featurePages, /\.matrix-status-screen\s*\{\s*--layout-page-inline:\s*16px;\s*\}/);
  assert.doesNotMatch(featurePages, /\.number-reference-screen \.feature-body\s*\{[^}]*padding-inline:\s*20px;/s);
});
