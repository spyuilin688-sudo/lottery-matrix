import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shared = fs.readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
const explore = fs.readFileSync(new URL('../src/matrix-explore-spacing.css', import.meta.url), 'utf8');
const featurePages = fs.readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
const responsive = fs.readFileSync(new URL('../src/responsive-feature-pages.css', import.meta.url), 'utf8');

test('title cards use the shared fourteen-pixel feature-page spacing [header migration]', () => {
  assert.match(shared, /\.product-header\s*\{[^}]*width:\s*100%;[^}]*padding:\s*0 var\(--layout-page-inline\);[^}]*margin-bottom:\s*var\(--layout-section-gap\);/s);
  // Merged title-gap refinement (7905e458 / 2eb63484) overrides the old 8px contract.
  const prototype = fs.readFileSync(new URL('../src/prototype.css', import.meta.url), 'utf8');
  assert.match(prototype, /\.feature-screen:not\(\.home-screen\)\s*\{[^}]*--layout-section-gap:\s*14px;/s);
  for (const css of [explore, responsive]) assert.doesNotMatch(css, /matrix-title-banner|feature-brand-header/);
  assert.doesNotMatch(featurePages, /\.profile-screen > \.product-header/);
});

