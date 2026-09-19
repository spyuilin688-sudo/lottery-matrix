import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { ruleBodies } from './helpers/css-rules.mjs';

const feature = fs.readFileSync('src/feature-pages.css', 'utf8');
const responsive = fs.readFileSync('src/responsive-feature-pages.css', 'utf8');
const tongxing = fs.readFileSync('src/tongxing-compact.css', 'utf8');
const explore = fs.readFileSync('src/matrix-explore-spacing.css', 'utf8');
const balls = fs.readFileSync('src/number-ball.css', 'utf8');
const source = readFeaturePagesSource();
const coreSource = fs.readFileSync('src/FeaturePagesCore.tsx', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');
const adjustments = fs.readFileSync('src/feature-page-adjustments.css', 'utf8');

test('三頁標題共用 24px 設定按鈕與 12px 文字 [header migration]', () => {
  const css = fs.readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
  const actions = ruleBodies(css, /^\.product-header__actions$/);
  assert.equal(actions.length, 1);
  assert.match(actions[0], /position:\s*absolute;[^}]*right:\s*4px;[^}]*bottom:\s*0px;/s);
  assert.match(actions[0], /min-width:\s*0;/);
  assert.match(actions[0], /width:\s*var\(--product-header-action-width\);/);
  assert.doesNotMatch(actions[0], /translate/);
  const control = ruleBodies(feature, /^\.product-header__settings-toggle$/);
  assert.equal(control.length, 1);
  assert.match(control[0], /height:\s*24px;/);
  assert.match(control[0], /font-size:\s*12px;/);
  assert.match(control[0], /border:\s*0;/);
  assert.match(control[0], /background:\s*transparent;/);
});

test('同星、對照單、歷史、計算機與 Matrix Explore 使用指定外距 [header migration]', () => {
  assert.match(feature, /\.product-header\s*\{[^}]*width:\s*100%;[^}]*padding:\s*0 var\(--layout-page-inline\);[^}]*margin-bottom:\s*var\(--layout-section-gap\);/s);
  assert.match(responsive, /--tool-page-inline:\s*var\(--layout-page-inline\);/);
  assert.doesNotMatch(explore, /matrix-title-banner/);
});

test('三個工具設定由 sticky 頁首提供定位且保留左右 16px', () => {
  const floating = ruleBodies(feature, /^\.product-header__settings-card\[data-floating="true"\]$/);
  assert.equal(floating.length, 1);
  assert.match(floating[0], /position:\s*absolute;[^}]*top:\s*0;[^}]*inset-inline:\s*var\(--layout-page-inline\);/s);
  assert.match(coreSource, /headerSettings=\{\{ id: "history-header-settings"/);
  assert.match(coreSource, /headerSettings=\{\{ id: "tongxing-header-settings"/);
  const reference = fs.readFileSync('src/features/NumberReferencePage.tsx', 'utf8');
  assert.match(reference, /headerSettings=\{\{ id: "reference-header-settings"/);
  for (const activeSource of [coreSource, reference]) {
    assert.doesNotMatch(activeSource, /set(?:Filter|Settings|Query)PanelTop|<MobilePagePortal/);
  }
});

test('設定選單共用單層圓角細框，保留原生選單與響應式字級', () => {
  const select = ruleBodies(feature, /^\.select-box$/);
  assert.equal(select.length, 1);
  assert.match(select[0], /border:\s*1px solid var\(--pwa-frame-tertiary\);/);
  assert.match(select[0], /border-radius:\s*var\(--pwa-frame-radius\);/);
  assert.match(select[0], /background:\s*var\(--pwa-control-surface\);/);
  for (const css of [feature, responsive, tongxing]) {
    assert.doesNotMatch(css, /\.select-box::(?:before|after)|--select-tech-cut/);
  }
  const rowSelect = ruleBodies(responsive, /^\.tool-settings-primary-row \.select-box$/);
  assert.equal(rowSelect.length, 1);
  assert.match(rowSelect[0], /width:\s*100%;[^}]*min-width:\s*0;/s);
  assert.doesNotMatch(rowSelect[0], /border(?:-radius)?:|background:/);
  assert.match(feature, /\.history-filter-panel select\s*\{[^}]*font-size:\s*clamp\(/s);
  assert.match(responsive, /\.reference-query-panel \.reference-select select\s*\{[^}]*font-size:\s*clamp\(/s);
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
  assert.match(feature, /\.notification-heading\s*\{[^}]*grid-template-columns:\s*clamp\(/s);
});

test('同星結果群組使用目前卡框、間距與雙列背景辨識', () => {
  assert.match(tongxing, /\.tongxing-screen \.tongxing-result-group\s*\{[^}]*border:\s*1px solid var\(--pwa-frame-secondary\);[^}]*border-radius:\s*var\(--pwa-frame-radius\);[^}]*background:\s*#030b13;/s);
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


test('號碼對照單刷新圖示不覆寫共用尺寸', () => {
  assert.doesNotMatch(responsive, /\.number-reference-screen \.reference-refresh-trigger > svg\s*\{/);
});
