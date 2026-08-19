import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('src/homepage-repair.css', 'utf8');
const tokens = fs.readFileSync('src/design-tokens.css', 'utf8');

function block(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? '';
}

test('homepage keeps zero top spacing and scales logo to 75 percent', () => {
  assert.match(tokens, /--primary-brand-top:\s*0px;/);
  assert.match(block(css, '.home-screen .home-logo-image'), /width:\s*75%;/);
});

test('lottery switcher and draw card use the 12px homepage inline baseline', () => {
  assert.match(tokens, /--layout-page-inline:\s*12px;/);
  assert.match(block(css, '.home-screen .lottery-screen'), /padding:\s*0 var\(--layout-page-inline\);/);
  assert.match(block(css, '.home-screen .lottery-switcher-hit-grid'), /gap:\s*3px;/);
});

test('embedded next draw info retains the requested compact metrics', () => {
  assert.match(block(css, '.home-screen .latest-draw-card .next-draw-info--embedded'), /padding:\s*0 20px;/);
  assert.match(block(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-item:last-child'), /padding-left:\s*16px;/);
  assert.match(block(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-icon'), /width:\s*14px;/);
  assert.match(block(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-icon'), /height:\s*14px;/);
  assert.match(block(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-label'), /font-size:\s*11px;/);
  assert.match(block(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-label'), /line-height:\s*13px;/);
  assert.match(block(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-value'), /font-size:\s*11px;/);
  assert.match(block(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-value'), /line-height:\s*13px;/);
});

test('Matrix Core and five shortcuts use 12px side margins and equal shortcut columns', () => {
  assert.match(block(css, '.home-screen .matrix-core-banner'), /width:\s*calc\(100% - \(var\(--layout-page-inline\) \* 2\)\);/);
  assert.match(block(css, '.home-screen .home-shortcut-row'), /width:\s*calc\(100% - \(var\(--layout-page-inline\) \* 2\)\);/);
  assert.match(block(css, '.home-screen .home-shortcut-row'), /grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\);/);
});
