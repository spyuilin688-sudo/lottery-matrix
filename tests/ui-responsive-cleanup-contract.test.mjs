import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { ruleBodies } from './helpers/css-rules.mjs';

const feature = fs.readFileSync('src/feature-pages.css', 'utf8');
const responsive = fs.readFileSync('src/responsive-feature-pages.css', 'utf8');
const tongxing = fs.readFileSync('src/tongxing-compact.css', 'utf8');
const explore = fs.readFileSync('src/matrix-explore-spacing.css', 'utf8');
const balls = fs.readFileSync('src/number-ball.css', 'utf8');
const source = fs.readFileSync('src/FeaturePages.tsx', 'utf8');
const coreSource = fs.readFileSync('src/FeaturePagesCore.tsx', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');
const adjustments = fs.readFileSync('src/feature-page-adjustments.css', 'utf8');

test('三頁標題操作按鈕由響應式內距縮減高度且維持原文字大小', () => {
  const sharedControl = ruleBodies(responsive, /^\.title-card-compact-action$/);
  assert.equal(sharedControl.length, 1);
  assert.match(sharedControl[0], /padding:\s*clamp\(3\.5px, 1vw, 4px\) 4\.5px;/);
  assert.match(sharedControl[0], /font-size:\s*clamp\(7\.2px, 2\.1vw, 9px\);/);
  assert.doesNotMatch(sharedControl[0], /(?:^|;)\s*(?:min-)?height\s*:/);
  assert.match(coreSource, /history-reset-trigger title-card-compact-action/);
  assert.match(coreSource, /tongxing-title-actions title-card-compact-actions/);
  assert.match(source, /reference-title-actions title-card-compact-actions/);
  assert.doesNotMatch(responsive, /(?:history|tongxing|reference)-title-actions[^{}]*\.title-card-compact-action\s*\{[^}]*(?:min-)?height\s*:/s);
  assert.doesNotMatch(responsive.match(/\.title-card-compact-action::before\s*\{[^}]*\}/s)?.[0] ?? '', /clip-path/);
  assert.doesNotMatch(responsive.match(/\.title-card-compact-action::after\s*\{[^}]*\}/s)?.[0] ?? '', /clip-path/);
  const actions = ruleBodies(responsive, /^\.number-reference-screen \.matrix-title-banner-actions$/);
  assert.equal(actions.length, 1);
  assert.match(actions[0], /width:\s*auto;/);
  const icon = ruleBodies(responsive, /^\.number-reference-screen \.reference-title-actions button:first-child > svg$/);
  assert.equal(icon.length, 1);
  assert.match(icon[0], /width:\s*7px;/);
  assert.match(icon[0], /height:\s*7px;/);
});

test('同星、對照單、歷史、計算機與 Matrix Explore 使用指定外距', () => {
  assert.match(responsive, /--tool-page-inline:\s*16px;/);
  for (const selector of [
    /^\.tongxing-screen \.feature-body$/,
    /^\.number-reference-screen \.feature-body$/,
    /^\.draw-history-screen \.feature-body$/,
  ]) {
    const bodies = ruleBodies(responsive, selector);
    assert.equal(bodies.length, 1);
    assert.match(bodies[0], /padding:\s*0 var\(--tool-page-inline\) var\(--layout-bottom-nav-clearance\);/);
  }
  assert.match(feature, /\.calculator-screen > \.feature-body\s*\{[^}]*padding:\s*0 var\(--layout-page-inline\) var\(--layout-bottom-nav-clearance\);/s);
  assert.match(explore, /\.matrix-explore-main-screen \.feature-body\s*\{[^}]*padding:\s*0 16px var\(--layout-bottom-nav-clearance\);/s);
  assert.match(explore, /\.matrix-explore-main-screen \.matrix-title-banner\s*\{[^}]*width:\s*calc\(100% - 32px\);/s);
  assert.doesNotMatch(tongxing, /\.tongxing-screen \.feature-body\s*\{/);
});

test('三個浮動設定卡固定於 viewport、左右 16px 且 top 使用 viewport 座標', () => {
  for (const selector of [
    /^\.tongxing-query\[data-floating="true"\]$/,
    /^\.history-filter-panel\[data-floating="true"\]$/,
    /^\.reference-query-panel\[data-floating="true"\]$/,
  ]) {
    const bodies = ruleBodies(responsive, selector);
    assert.equal(bodies.length, 1);
    assert.match(bodies[0], /position:\s*fixed;/);
    assert.match(bodies[0], /left:\s*16px;/);
    assert.match(bodies[0], /right:\s*16px;/);
  }
  assert.match(source, /setFilterPanelTop\(\(header\?\.getBoundingClientRect\(\)\.bottom \?\? 0\) \+ 8\)/);
  assert.match(source, /setSettingsPanelTop\(\(header\?\.getBoundingClientRect\(\)\.bottom \?\? 0\) \+ 8\)/);
  assert.match(source, /setQueryPanelTop\(\(header\?\.getBoundingClientRect\(\)\.bottom \?\? 0\) \+ 8\)/);
});

test('設定區沿用目前深色直角與原生選單圖層契約', () => {
  assert.ok(ruleBodies(feature, /^\.history-filter-panel \.select-box::after$/).some((body) => /display:\s*none;/.test(body)));
  assert.ok(ruleBodies(feature, /^\.reference-query-panel \.select-box::after$/).some((body) => /display:\s*none;/.test(body)));
  assert.ok(ruleBodies(responsive, /^\.history-filter-primary-row \.select-box::after$/).some((body) => /display:\s*block;/.test(body)));
  assert.ok(ruleBodies(tongxing, /^\.tongxing-query \.query-selects \.select-box::after$/).some((body) => /display:\s*block;/.test(body)));
  assert.match(feature, /\.history-filter-panel select\s*\{[^}]*font-size:\s*clamp\(/s);
  assert.match(feature, /\.number-reference-screen \.reference-select select\s*\{[^}]*font-size:\s*clamp\(/s);
  const tongxingSelect = ruleBodies(tongxing, /^\.tongxing-query \.same-star-period-select select$/);
  assert.ok(tongxingSelect.some((body) => /font-size:\s*clamp\(9px, 3vw, 12px\);/.test(body)));
});

test('歷史日期未修改時不自動套用預設日期', () => {
  assert.match(source, /const \[dateFilterTouched, setDateFilterTouched\] = useState\(false\);/);
  assert.match(source, /date:\s*dateFilterTouched\s*\?/);
  assert.match(source, /setDateFilterTouched\(true\)/);
});

test('歷史今彩539真實使用 .2px 底線且 Matrix Explore 不洩漏', () => {
  assert.doesNotMatch(balls, /\.matrix-explore-main-screen \.history-panel/);
  assert.match(balls, /\.matrix-explore-main-screen \.matrix-explore-history-panel/);
  const bodies = ruleBodies(balls, /^\.draw-history-screen \.draw-history-panel:is\(\[data-lottery="今彩539"\], \[data-lottery="天天樂"\]\) \.number-ball-component\.history-lottery-ball$/);
  assert.equal(bodies.length, 1);
  assert.match(bodies[0], /--underline-y:\s*\.2px;/);
});

test('通知與底部品牌頁移除固定 Logo 特例和小螢幕強拉', () => {
  assert.match(adjustments, /\.notifications-screen-v2 \.feature-body\s*\{[^}]*var\(--layout-bottom-nav-clearance\)/s);
  assert.doesNotMatch(feature, /\.notifications-screen \.feature-body\s*\{[^}]*--mobile-safe-area-height/s);
  assert.doesNotMatch(responsive, /\.bottom-nav-brand-screen \.shared-brand-logo\s*\{[^}]*width:\s*75%/s);
  assert.doesNotMatch(responsive, /bottom-nav-brand-screen\.notifications-screen[^}]*margin-bottom:\s*4px/s);
  assert.doesNotMatch(responsive, /@media \(max-width:\s*360px\)[\s\S]*?notification-heading/);
  assert.match(responsive, /\.notification-heading\s*\{[^}]*grid-template-columns:\s*clamp\(/s);
});

test('同星結果群組使用目前卡框、間距與雙列背景辨識', () => {
  assert.match(tongxing, /\.tongxing-screen \.tongxing-result-group\s*\{[^}]*border:\s*1px solid rgba\(187, 134, 47, \.78\);[^}]*background:\s*#030b13;/s);
  assert.match(tongxing, /\.tongxing-screen \.tongxing-result-group \+ \.tongxing-result-group\s*\{\s*margin-top:\s*6px;/s);
  assert.match(tongxing, /data-row-type="locked"[^}]*rgba\(126, 83, 15, \.32\)/s);
  assert.match(tongxing, /data-row-type="predicted"[^}]*rgba\(10, 61, 88, \.38\)/s);
  assert.doesNotMatch(tongxing, /--group-divider-width/);
});

test('臨時底部安全區 override 已移除', () => {
  assert.doesNotMatch(explore, /--layout-bottom-nav-clearance:[^;]*--mobile-safe-area-height/);
  assert.doesNotMatch(feature, /\.calculator-screen > \.feature-body\s*\{[^}]*80px/s);
  assert.doesNotMatch(main, /bottom-nav-responsive-clearance\.css/);
  assert.equal(fs.existsSync('src/bottom-nav-responsive-clearance.css'), false);
});
