import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shared = fs.readFileSync(new URL('../src/brand-header-unify.css', import.meta.url), 'utf8');
const explore = fs.readFileSync(new URL('../src/matrix-explore-spacing.css', import.meta.url), 'utf8');

test('integrated title cards have no extra bottom gap and no page-specific overrides', () => {
  assert.match(shared, /\.feature-brand-header\.integrated-title-header\s*\{[^}]*margin-bottom:\s*0\s*;/s);
  assert.match(shared, /\.bottom-nav-brand-screen\s*>\s*\.feature-brand-header:not\(\.integrated-title-header\)\s*\{/);
  assert.doesNotMatch(shared, /\.bottom-nav-brand-screen\s*>\s*\.feature-brand-header\.integrated-title-header\s*\{/);
  assert.doesNotMatch(explore, /\.matrix-explore-main-screen\s*>\s*\.feature-brand-header\.integrated-title-header\s*\{/);
});
