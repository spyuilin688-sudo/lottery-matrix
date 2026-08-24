import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shared = fs.readFileSync(new URL('../src/brand-header-unify.css', import.meta.url), 'utf8');
const explore = fs.readFileSync(new URL('../src/matrix-explore-spacing.css', import.meta.url), 'utf8');
const featurePages = fs.readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
const responsive = fs.readFileSync(new URL('../src/responsive-feature-pages.css', import.meta.url), 'utf8');

test('all title cards use the shared eight-pixel content gap without page overrides', () => {
  assert.match(shared, /\.feature-brand-header,\s*\.feature-brand-header\[data-compact="true"\]\s*\{[^}]*margin:\s*0 auto var\(--layout-section-gap\)\s*;/s);
  assert.doesNotMatch(shared, /\.feature-brand-header\.integrated-title-header\s*\{[^}]*margin-bottom\s*:/s);
  assert.match(shared, /\.bottom-nav-brand-screen\s*>\s*\.feature-brand-header:not\(\.integrated-title-header\)\s*\{/);
  assert.doesNotMatch(shared, /\.bottom-nav-brand-screen\s*>\s*\.feature-brand-header\.integrated-title-header\s*\{/);
  assert.doesNotMatch(explore, /\.matrix-explore-main-screen\s*>\s*\.feature-brand-header\.integrated-title-header\s*\{/);
  assert.doesNotMatch(featurePages, /(?:matrix-status-screen|matrix-tianyan-screen|matrix-tiangong-screen)[^{]*\.feature-brand-header\s*\{[^}]*margin-bottom\s*:/s);
  assert.doesNotMatch(featurePages, /(?:draw-history-screen|matrix-explore-screen)[^{]*\.matrix-title-banner\s*\{[^}]*margin-bottom\s*:/s);
  assert.doesNotMatch(responsive, /(?:draw-history-screen|tongxing-screen|number-reference-screen)[^{]*\.matrix-title-banner\s*\{[^}]*margin-bottom\s*:/s);
  assert.match(responsive, /\.draw-history-screen \.feature-body,\s*\.tongxing-screen \.feature-body,\s*\.number-reference-screen \.feature-body\s*\{[^}]*padding:\s*0 var\(--tool-page-inline\) var\(--layout-bottom-nav-clearance\)\s*;/s);
  assert.match(explore, /\.matrix-explore-main-screen \.feature-body\s*\{[^}]*padding:\s*0 16px var\(--layout-bottom-nav-clearance\)\s*;/s);
});
