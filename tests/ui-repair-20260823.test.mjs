import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const responsive = readFileSync('src/responsive-feature-pages.css', 'utf8');
const feature = readFileSync('src/feature-pages.css', 'utf8');
const home = readFileSync('src/homepage-repair.css', 'utf8');
const tokens = readFileSync('src/design-tokens.css', 'utf8');
const bottomNav = readFileSync('src/BottomNavigation.tsx', 'utf8');

function block(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return '';
  const bodyStart = css.indexOf('{', start) + 1;
  return css.slice(bodyStart, css.indexOf('}', bodyStart));
}

test('tool title actions use 22px controls and the 87.5% border anchor', () => {
  const actions = responsive.match(/\.draw-history-screen \.matrix-title-banner-actions,[\s\S]*?\.number-reference-screen \.matrix-title-banner-actions\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(actions, /top:\s*100%\s*;/);
  assert.match(actions, /bottom:\s*auto\s*;/);
  assert.match(actions, /transform:\s*translateY\(-87\.5%\)\s*;/);
  assert.match(responsive, /\.tongxing-screen \.tongxing-title-actions \.title-card-compact-action,[\s\S]*?\.number-reference-screen \.reference-title-actions \.title-card-compact-action\s*\{[^}]*height:\s*22px;[^}]*min-height:\s*22px;/s);
  assert.match(responsive, /\.draw-history-screen \.history-reset-trigger\s*\{[^}]*gap:\s*1px;/s);
  assert.match(responsive, /\.number-reference-screen \.reference-title-actions button:first-child\s*\{[^}]*gap:\s*1px;/s);
});

test('all three portal floating setting cards own explicit 16px inline offsets', () => {
  for (const selector of ['.history-filter-panel[data-floating="true"]', '.reference-query-panel[data-floating="true"]', '.tongxing-query[data-floating="true"]']) {
    const css = block(responsive, selector);
    assert.match(css, /left:\s*16px\s*;/);
    assert.match(css, /right:\s*16px\s*;/);
  }
});

test('notification compact responsive layout is present in the canonical responsive stylesheet', () => {
  assert.match(responsive, /\.notifications-screen \.feature-body\s*\{[^}]*gap:\s*4px;[^}]*padding-inline:\s*20px;/s);
  assert.match(responsive, /\.notification-heading\s*\{[^}]*grid-template-columns:\s*clamp\(40px, 12\.3vw, 48px\) minmax\(0, 1fr\) clamp\(64px, 19\.5vw, 76px\) 42px;/s);
  assert.match(responsive, /\.notification-icon\s*\{[^}]*width:\s*clamp\(40px, 11\.3vw, 44px\);[^}]*height:\s*clamp\(40px, 11\.3vw, 44px\);/s);
});

test('quick touch path opens on short pointer release without double firing the following click', () => {
  assert.match(bottomNav, /suppressQuickClick/);
  assert.match(bottomNav, /onPointerUp:\s*finishQuickPress/);
  assert.match(bottomNav, /onClick:\s*handleQuickClick/);
  assert.match(bottomNav, /onQuickOpen\?\.\(\)/);
});

test('calculator and requested homepage surfaces use the formal 12px inline token', () => {
  assert.match(tokens, /--layout-page-inline:\s*12px;/);
  assert.match(block(feature, '.calculator-screen > .feature-body'), /padding:\s*0 var\(--layout-page-inline\) var\(--layout-bottom-nav-clearance\)/);
  assert.match(home, /\.home-screen \.lottery-screen\s*\{[^}]*padding:\s*0 var\(--layout-page-inline\);/s);
  assert.match(home, /\.home-screen \.matrix-core-banner\s*\{[^}]*width:\s*calc\(100% - \(var\(--layout-page-inline\) \* 2\)\);/s);
});
