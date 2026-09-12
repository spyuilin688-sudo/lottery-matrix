import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shared = fs.readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
const explore = fs.readFileSync(new URL('../src/matrix-explore-spacing.css', import.meta.url), 'utf8');
const featurePages = fs.readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
const responsive = fs.readFileSync(new URL('../src/responsive-feature-pages.css', import.meta.url), 'utf8');

test('title cards use the shared eight-pixel default and the approved profile spacing [header migration]', () => {
  assert.match(shared, /\.product-header\s*\{[^}]*width:\s*100%;[^}]*padding:\s*0 var\(--layout-page-inline\);[^}]*margin-bottom:\s*8px;/s);
  for (const css of [explore, responsive]) assert.doesNotMatch(css, /matrix-title-banner|feature-brand-header/);
  assert.doesNotMatch(featurePages, /\.profile-screen > \.product-header/);
});

