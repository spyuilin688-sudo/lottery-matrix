import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('src/homepage-repair.css', 'utf8');
const tokens = fs.readFileSync('src/design-tokens.css', 'utf8');

function blocks(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'gs'))].map((match) => match[1]);
}

function assertBlock(source, selector, pattern) {
  assert.ok(blocks(source, selector).some((body) => pattern.test(body)), `${selector} missing ${pattern}`);
}

test('homepage keeps zero top spacing and scales logo to 75 percent', () => {
  assert.match(tokens, /--primary-brand-top:\s*0px;/);
  assertBlock(css, '.home-screen .home-logo-image', /width:\s*75%;/);
});

test('lottery switcher and draw card use the 12px homepage inline baseline', () => {
  assert.match(tokens, /--layout-page-inline:\s*12px;/);
  assertBlock(css, '.home-screen .lottery-screen', /padding:\s*0 var\(--layout-page-inline\);/);
  assertBlock(css, '.home-screen .lottery-switcher-hit-grid', /gap:\s*3px;/);
});

test('home bottom group has no black clearance above bottom navigation', () => {
  assertBlock(css, '.home-screen .home-bottom-group', /padding-bottom:\s*0;/);
  assertBlock(css, '.home-screen .home-bottom-group', /height:\s*calc\(var\(--home-core-height\) \+ var\(--home-features-height\) \+ var\(--home-gap-core-features\)\);/);
  assertBlock(css, '.home-screen .home-bottom-group', /min-height:\s*calc\(var\(--home-core-height\) \+ var\(--home-features-height\) \+ var\(--home-gap-core-features\)\);/);
});

test('embedded next draw info retains the requested compact metrics', () => {
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded', /padding:\s*0 20px;/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-item:last-child', /padding-left:\s*16px;/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-icon', /width:\s*14px;/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-icon', /height:\s*14px;/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-label', /font-size:\s*11px;/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-label', /line-height:\s*13px;/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-value', /font-size:\s*11px;/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-value', /line-height:\s*13px;/);
});

test('Matrix Core and five shortcuts use 12px side margins and equal shortcut columns', () => {
  assertBlock(css, '.home-screen .matrix-core-banner', /width:\s*calc\(100% - \(var\(--layout-page-inline\) \* 2\)\);/);
  assertBlock(css, '.home-screen .home-shortcut-row', /width:\s*calc\(100% - \(var\(--layout-page-inline\) \* 2\)\);/);
  assertBlock(css, '.home-screen .home-shortcut-row', /grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\);/);
});
