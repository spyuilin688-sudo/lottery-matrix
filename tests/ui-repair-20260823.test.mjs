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
const adjustments = readFileSync('src/feature-page-adjustments.css', 'utf8');

function block(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return ruleBodies(css, new RegExp(`^${escaped}$`))[0] ?? '';
}

test('tool title actions use content-driven compact controls and the 87.5% border anchor', () => {
  const actions = ruleBodies(responsive, /^\.draw-history-screen \.matrix-title-banner-actions$/)[0] ?? '';
  assert.match(actions, /top:\s*100%\s*;/);
  assert.match(actions, /bottom:\s*auto\s*;/);
  assert.match(actions, /width:\s*auto\s*;/);
  assert.match(actions, /transform:\s*translateY\(-87\.5%\)\s*;/);
  assert.doesNotMatch(responsive, /(?:tongxing|reference)-title-actions[^{}]*\.title-card-compact-action\s*\{[^}]*(?:min-)?height\s*:/s);
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

test('notification compact responsive layout is present in the v2 canonical stylesheet', () => {
  assert.match(responsive, /\.notifications-screen \.feature-body\s*\{[^}]*gap:\s*4px;/s);
  assert.match(adjustments, /\.notifications-screen-v2 \.feature-body\s*\{[^}]*padding:\s*0 var\(--layout-page-inline\)/s);
  assert.match(adjustments, /\.notifications-screen-v2 \.notification-actions\s*\{[^}]*grid-template-columns:\s*64px 38px;/s);
  assert.match(adjustments, /\.notifications-screen-v2 \.notification-icon,[\s\S]*?width:\s*36px;[^}]*height:\s*36px;/s);
  assert.match(adjustments, /\.notifications-screen-v2 \.notification-heading\s*\{[^}]*padding:\s*4px 8px 4px 4px;/s);
  assert.doesNotMatch(adjustments, /\.notifications-screen-v2 \.notification-system-group \.notification-heading\s*\{[^}]*padding-block:\s*0;/s);
  assert.match(adjustments, /\.notifications-screen-v2 \.notification-settings-toggle\s*\{[^}]*height:\s*20px;[^}]*min-height:\s*20px;[^}]*font-size:\s*clamp\(8px,\s*2\.4vw,\s*10px\);/s);
  assert.match(adjustments, /\.notifications-screen-v2 \.notification-actions > \.toggle\s*\{[^}]*height:\s*20px;[^}]*align-self:\s*center;/s);
  assert.match(adjustments, /\.notifications-screen-v2 \.toggle::before\s*\{[^}]*top:\s*0;[^}]*height:\s*20px;/s);
  assert.match(adjustments, /\.notifications-screen-v2 \.toggle span\s*\{[^}]*top:\s*2px;[^}]*height:\s*16px;/s);
});

test('quick interaction keeps primary click and uses homepage-only double-click settings', () => {
  const renderedButton = bottomNav.match(/<button[\s\S]*?<\/button>/)?.[0] ?? '';
  assert.ok(renderedButton, 'BottomNavigation must render its navigation button explicitly');
  assert.match(renderedButton, /onClick=\{label === "快捷" \? onQuickOpen : \(\) => screen && onNavigate\?\.\(screen\)\}/);
  assert.match(bottomNav, /const QUICK_SETTINGS_DOUBLE_TAP_MS = 400;/);
  assert.match(bottomNav, /showQuickSettings && onQuickConfigure \? \(/);
  assert.match(bottomNav, /handleQuickSettingsClick/);
  assert.match(bottomNav, /event\.detail === 0/);
  assert.doesNotMatch(bottomNav, /QUICK_LONG_PRESS_MS|beginQuickPress|finishQuickPress|cancelQuickPress|onPointerDown|onPointerUp|onPointerCancel/);
  assert.doesNotMatch(adjustments, /bottom-navigation-item\[data-quick-gesture="true"\]/);
  assert.doesNotMatch(adjustments, /data-dragging|will-change:\s*transform/);
});
test('calculator uses the page token and homepage core keeps its fitted responsive geometry', () => {
  assert.match(tokens, /--layout-page-inline:\s*16px;/);
  assert.match(block(feature, '.calculator-screen > .feature-body'), /padding:\s*0 var\(--layout-page-inline\) var\(--layout-bottom-nav-clearance\)/);
  assert.ok(ruleBodies(home, /^\.home-screen \.lottery-screen$/).some((body) => /padding:\s*0 var\(--layout-page-inline\);/.test(body)));
  assert.ok(ruleBodies(home, /^\.home-screen \.home-bottom-group$/).some((body) => /--home-core-width:\s*calc\(min\(100vw, 390px\) - 32px\);/.test(body)));
  assert.ok(ruleBodies(home, /^\.home-screen \.matrix-core-banner$/).some((body) => /width:\s*var\(--home-core-width\);/.test(body) && /height:\s*var\(--home-core-height\);/.test(body)));
  assert.match(home, /--home-core-height:\s*clamp\(68px,\s*calc\(\(var\(--home-core-width\) \* 414 \/ 1536\) - 18px\),\s*79px\);/);
});
