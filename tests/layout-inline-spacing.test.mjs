import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('feature pages use the shared 16px source while notification keeps 18px bulk and 16px card insets', () => {
  const tokens = read('src/design-tokens.css');
  const home = read('src/homepage/base.css');
  const responsive = read('src/responsive-feature-pages.css');
  const explore = read('src/matrix-explore-spacing.css');
  const adjustments = read('src/feature-page-adjustments.css');
  const featurePages = read('src/feature-pages.css');

  assert.match(tokens, /--layout-page-inline:\s*16px;/);
  assert.match(home, /\.home-screen \.lottery-screen\s*\{[^}]*--layout-page-inline:\s*16px;/s);

  assert.match(responsive, /--tool-page-inline:\s*var\(--layout-page-inline\);/);
  const floatingCard = featurePages.match(/\.product-header__settings-card\[data-floating="true"\]\s*\{([^}]*)\}/);
  assert.ok(floatingCard, 'the shared header must own floating tool settings');
  assert.match(floatingCard[1], /position:\s*absolute;/);
  assert.match(floatingCard[1], /inset-inline:\s*var\(--layout-page-inline\);/);
  assert.match(explore, /\.matrix-explore-screen \.feature-body\s*\{[^}]*padding-inline:\s*13px;/s);
  assert.match(explore, /\.matrix-explore-screen \.feature-body > :not\(\.result-panel\),[\s\S]*?margin-inline:\s*3px;/);

  assert.match(adjustments, /\.notifications-screen-v2\s*\{[^}]*--notification-bulk-inline:\s*18px;[^}]*--notification-list-inline:\s*16px;/s);
  assert.match(adjustments, /\.notifications-screen-v2 \.feature-body\s*\{[^}]*padding-inline:\s*var\(--notification-list-inline\);/s);
  assert.match(adjustments, /\.notifications-screen-v2 \.notification-list\s*\{[^}]*margin-inline:\s*0;/s);
  assert.doesNotMatch(adjustments, /\.profile-screen \.feature-body\s*\{\s*padding-inline:\s*16px;/s);

  assert.doesNotMatch(featurePages, /\.matrix-status-screen\s*\{\s*--layout-page-inline:\s*16px;\s*\}/);
  assert.doesNotMatch(featurePages, /\.number-reference-screen \.feature-body\s*\{[^}]*padding-inline:\s*20px;/s);
  assert.doesNotMatch(featurePages, /\.draw-history-screen \.matrix-title-banner\s*\{[^}]*width:\s*calc\(100% - 24px\)/s);

  const profileBodyBlocks = [...featurePages.matchAll(/([^{}]*\.profile-screen \.feature-body[^{}]*)\{([^}]*)\}/g)];
  assert.ok(profileBodyBlocks.length > 0, 'profile page should retain its existing feature-body rules');
  for (const [, , block] of profileBodyBlocks) {
    assert.doesNotMatch(block, /\b(?:padding-inline|padding-left|padding-right|margin-inline|margin-left|margin-right|left|right|width|transform)\s*:/);
  }
});


test('tool settings use the shared typeface owner', () => {
  const responsive = read('src/responsive-feature-pages.css');
  const sharedPanel = responsive.match(/\.tool-settings-panel\s*\{([\s\S]*?)\}/);
  assert.ok(sharedPanel, 'tool settings panels must have a shared base rule');
  assert.match(sharedPanel[1], /font-family:\s*Inter,\s*"Noto Sans TC",\s*"PingFang TC",\s*"Microsoft JhengHei",\s*sans-serif;/);
});
