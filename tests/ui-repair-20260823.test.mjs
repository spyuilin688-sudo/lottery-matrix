import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ruleBodies } from './helpers/css-rules.mjs';
import { readLocalCss } from './helpers/read-local-css.mjs';

const responsive = readFileSync('src/responsive-feature-pages.css', 'utf8');
const feature = readFileSync('src/feature-pages.css', 'utf8');
const home = readLocalCss('src/homepage-repair.css');
const tokens = readFileSync('src/design-tokens.css', 'utf8');
const bottomNav = readFileSync('src/BottomNavigation.tsx', 'utf8');

function block(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return ruleBodies(css, new RegExp(`^${escaped}$`))[0] ?? '';
}

test('tool title actions use 22px controls and the 87.5% border anchor', () => {
  const actions = ruleBodies(responsive, /^\.draw-history-screen \.matrix-title-banner-actions$/)[0] ?? '';
  assert.match(actions, /top:\s*100%\s*;/);
  assert.match(actions, /bottom:\s*auto\s*;/);
  assert.match(actions, /width:\s*auto\s*;/);
  assert.match(actions, /transform:\s*translateY\(-87\.5%\)\s*;/);
  for (const selector of [
    /^\.tongxing-screen \.tongxing-title-actions \.title-card-compact-action$/,
    /^\.number-reference-screen \.reference-title-actions \.title-card-compact-action$/,
  ]) {
    const bodies = ruleBodies(responsive, selector);
    assert.equal(bodies.length, 1);
    assert.match(bodies[0], /height:\s*22px;/);
    assert.match(bodies[0], /min-height:\s*22px;/);
  }
  assert.match(responsive, /\.draw-history-screen \.history-reset-trigger\s*\{[^}]*gap:\s*1px;/s);
  assert.match(responsive, /\.number-reference-screen \.reference-title-actions button:first-child\s*\{[^}]*gap:\s*1px;/s);
});

test('all three portal floating setting cards share explicit 16px inline offsets', () => {
  const match = responsive.match(/\.history-filter-panel\[data-floating="true"\],\s*\.reference-query-panel\[data-floating="true"\],\s*\.tongxing-query\[data-floating="true"\]\s*\{([\s\S]*?)\}/);
  const css = match?.[1] ?? '';
  assert.ok(match, 'the three floating panels must use one shared formal controller');
  assert.match(css, /left:\s*16px\s*;/);
  assert.match(css, /right:\s*16px\s*;/);
});

test('notification compact responsive layout is present in the canonical responsive stylesheet', () => {
  assert.match(responsive, /\.notifications-screen \.feature-body\s*\{[^}]*gap:\s*4px;[^}]*padding-inline:\s*20px;/s);
  assert.match(responsive, /\.notification-heading\s*\{[^}]*grid-template-columns:\s*clamp\(40px, 12\.3vw, 48px\) minmax\(0, 1fr\) clamp\(64px, 19\.5vw, 76px\) 42px;/s);
  assert.match(responsive, /\.notification-icon\s*\{[^}]*width:\s*clamp\(40px, 11\.3vw, 44px\);[^}]*height:\s*clamp\(40px, 11\.3vw, 44px\);/s);
});

test('quick interaction retains the current touch, mouse, click and long-press paths', () => {
  const renderedButton = bottomNav.match(/<button[\s\S]*?<\/button>/)?.[0] ?? '';
  assert.ok(renderedButton, 'BottomNavigation must render its navigation button explicitly');
  assert.match(renderedButton, /onTouchStart=\{label === "快捷" \? beginQuickPress : undefined\}/);
  assert.match(renderedButton, /onTouchEnd=\{label === "快捷" \? finishQuickPress : undefined\}/);
  assert.match(renderedButton, /onTouchCancel=\{label === "快捷" \? finishQuickPress : undefined\}/);
  assert.match(renderedButton, /onMouseDown=\{label === "快捷" \? beginQuickPress : undefined\}/);
  assert.match(renderedButton, /onMouseUp=\{label === "快捷" \? finishQuickPress : undefined\}/);
  assert.match(renderedButton, /onClick=\{label === "快捷" \? handleQuickClick : \(\) => screen && onNavigate\?\.\(screen\)\}/);
  assert.match(bottomNav, /onQuickOpen\?\.\(\)/);
  assert.match(bottomNav, /onQuickConfigure\?\.\(\)/);
});

test('calculator uses the page token and homepage core keeps its current responsive geometry', () => {
  assert.match(tokens, /--layout-page-inline:\s*12px;/);
  assert.match(block(feature, '.calculator-screen > .feature-body'), /padding:\s*0 var\(--layout-page-inline\) var\(--layout-bottom-nav-clearance\)/);
  assert.ok(ruleBodies(home, /^\.home-screen \.lottery-screen$/).some((body) => /padding:\s*0 var\(--layout-page-inline\);/.test(body)));
  assert.ok(ruleBodies(home, /^\.home-screen \.home-bottom-group$/).some((body) => /--home-core-width:\s*calc\(min\(100vw, 390px\) - 32px\);/.test(body)));
  assert.ok(ruleBodies(home, /^\.home-screen \.matrix-core-banner$/).some((body) => /width:\s*var\(--home-core-width\);/.test(body) && /height:\s*var\(--home-core-height\);/.test(body)));
  assert.match(home, /--home-core-height:\s*calc\(\(var\(--home-core-width\) \* 414 \/ 1536\) - 6px\);/);
});
