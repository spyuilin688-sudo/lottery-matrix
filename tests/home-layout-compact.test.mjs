import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('src/homepage-repair.css', 'utf8');
const block = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? '';
};

test('home logo is 25 percent smaller without top offset', () => {
  assert.match(css, /\.home-screen \.home-logo-image\s*\{\s*width:\s*75%;\s*\}/);
  assert.doesNotMatch(block('.home-screen .brand-header'), /padding-top:\s*[1-9]|margin-top:\s*[1-9]/);
});

test('home horizontal groups use 12px baseline and lottery switcher uses 3px card gap', () => {
  assert.match(css, /--layout-page-inline:\s*12px|padding:\s*0 var\(--layout-page-inline\)/);
  assert.match(block('.home-screen .lottery-switcher-hit-grid'), /gap:\s*3px/);
  assert.match(block('.home-screen .home-bottom-group'), /width:\s*calc\(100% - \(var\(--layout-page-inline\) \* 2\)\)/);
  assert.match(block('.home-screen .home-bottom-group'), /margin-inline:\s*auto/);
});

test('next draw compact values remain exact', () => {
  assert.match(block('.home-screen .latest-draw-card .next-draw-info--embedded'), /padding:\s*0 20px/);
  assert.match(block('.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-item:last-child'), /padding-left:\s*16px/);
  assert.match(block('.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-icon'), /width:\s*14px/);
  assert.match(block('.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-icon'), /height:\s*14px/);
  assert.match(block('.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-label'), /font-size:\s*11px/);
  assert.match(block('.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-label'), /line-height:\s*13px/);
  assert.match(block('.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-value'), /font-size:\s*11px/);
  assert.match(block('.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-value'), /line-height:\s*13px/);
});

test('five home shortcuts stay equal-width and their images fill each equal grid cell', () => {
  assert.match(block('.home-screen .home-shortcut-row'), /grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(block('.home-screen .home-shortcut img'), /width:\s*100%/);
});
