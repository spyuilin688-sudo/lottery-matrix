import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shared = fs.readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
const explore = fs.readFileSync(new URL('../src/matrix-explore-spacing.css', import.meta.url), 'utf8');
const featurePages = fs.readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
const responsive = fs.readFileSync(new URL('../src/responsive-feature-pages.css', import.meta.url), 'utf8');
const prototype = fs.readFileSync(new URL('../src/prototype.css', import.meta.url), 'utf8');

test('title cards inherit the approved 14px feature-screen gap [header migration]', () => {
  // 7905e45 / 2eb6348: one shared screen token, not a page-specific override.
  assert.match(prototype, /\.feature-screen:not\(\.home-screen\)\s*\{[^}]*--layout-section-gap:\s*14px;/s);
  assert.match(shared, /\.product-header\s*\{[^}]*width:\s*100%;[^}]*padding:\s*0 var\(--layout-page-inline\);[^}]*margin-bottom:\s*var\(--layout-section-gap\);/s);
  for (const css of [explore, responsive]) assert.doesNotMatch(css, /matrix-title-banner|feature-brand-header/);
  assert.doesNotMatch(featurePages, /\.profile-screen > \.product-header/);
});
