import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const feature = fs.readFileSync('src/feature-pages.css', 'utf8');
const responsive = fs.readFileSync('src/responsive-feature-pages.css', 'utf8');
const tongxing = fs.readFileSync('src/tongxing-compact.css', 'utf8');
const explore = fs.readFileSync('src/matrix-explore-spacing.css', 'utf8');
const balls = fs.readFileSync('src/number-ball.css', 'utf8');
const source = fs.readFileSync('src/FeaturePages.tsx', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');

test('三頁標題操作按鈕為 27.4px 直角外框、零文字箭頭間距，對照單刷新 7px', () => {
  assert.match(responsive, /\.title-card-compact-action\s*\{[^}]*height:\s*27\.4px;[^}]*min-height:\s*27\.4px;[^}]*gap:\s*0;/s);
  assert.doesNotMatch(responsive.match(/\.title-card-compact-action::before\s*\{[^}]*\}/s)?.[0] ?? '', /clip-path/);
  assert.doesNotMatch(responsive.match(/\.title-card-compact-action::after\s*\{[^}]*\}/s)?.[0] ?? '', /clip-path/);
  assert.match(responsive, /\.number-reference-screen \.matrix-title-banner-actions\s*\{[^}]*width:\s*40%;/s);
  assert.match(responsive, /\.title-card-compact-action \.reference-refresh-icon\s*\{[^}]*width:\s*7px;[^}]*height:\s*7px;/s);
});

test('同星、對照單、歷史、計算機與 Matrix Explore 使用指定外距', () => {
  assert.match(tongxing, /\.tongxing-screen \.feature-body\s*\{[^}]*width:\s*calc\(100% - 40px\);[^}]*margin-inline:\s*20px;/s);
  assert.match(feature, /\.number-reference-screen \.feature-body\s*\{[^}]*width:\s*100%;[^}]*padding-inline:\s*20px;[^}]*row-gap:\s*12px;/s);
  assert.match(responsive, /\.draw-history-screen \.feature-body\s*\{[^}]*padding-inline:\s*20px;[^}]*gap:\s*12px;/s);
  assert.match(feature, /\.calculator-screen > \.feature-body\s*\{[^}]*padding:\s*0 20px var\(--layout-bottom-nav-clearance\);/s);
  assert.match(explore, /\.matrix-explore-main-screen \.feature-body\s*\{[^}]*padding:\s*0 12px var\(--layout-bottom-nav-clearance\);/s);
  assert.match(explore, /\.matrix-explore-main-screen \.matrix-title-banner\s*\{[^}]*width:\s*calc\(100% - 24px\);/s);
  assert.doesNotMatch(responsive, /\.number-reference-screen \.feature-body\s*\{/);
});

test('三個浮動設定卡固定於 viewport、左右 20px 且 top 使用 viewport 座標', () => {
  assert.match(tongxing, /\.tongxing-query\[data-floating="true"\]\s*\{[^}]*position:\s*fixed;[^}]*left:\s*20px;[^}]*right:\s*20px;/s);
  assert.match(feature, /\.history-filter-panel\[data-floating="true"\]\s*\{[^}]*position:\s*fixed;[^}]*left:\s*20px;[^}]*right:\s*20px;/s);
  assert.match(feature, /\.reference-query-panel\[data-floating="true"\]\s*\{[^}]*position:\s*fixed;[^}]*left:\s*20px;[^}]*right:\s*20px;/s);
  assert.match(source, /setFilterPanelTop\(\(header\?\.getBoundingClientRect\(\)\.bottom \?\? 0\) \+ 8\)/);
  assert.match(source, /setSettingsPanelTop\(\(header\?\.getBoundingClientRect\(\)\.bottom \?\? 0\) \+ 8\)/);
  assert.match(source, /setQueryPanelTop\(\(header\?\.getBoundingClientRect\(\)\.bottom \?\? 0\) \+ 8\)/);
});

test('設定區直角選項與文字響應式適配', () => {
  assert.match(feature, /\.history-filter-panel \.select-box::before,[\s\S]*?\.history-filter-panel \.select-box::after\s*\{\s*display:\s*none;/s);
  assert.match(feature, /\.reference-query-panel \.select-box::before,[\s\S]*?\.reference-query-panel \.select-box::after\s*\{\s*display:\s*none;/s);
  assert.match(tongxing, /\.tongxing-panel-scope \.select-box::before,[\s\S]*?\.tongxing-panel-scope \.select-box::after\s*\{\s*display:\s*none;/s);
  assert.match(feature, /\.history-filter-panel select\s*\{[^}]*font-size:\s*clamp\(/s);
  assert.match(feature, /\.number-reference-screen \.reference-select select\s*\{[^}]*font-size:\s*clamp\(/s);
  assert.equal((tongxing.match(/font-size:\s*clamp\(9px, 3vw, 12px\);/g) ?? []).length, 3);
});

test('歷史日期未修改時不自動套用預設日期', () => {
  assert.match(source, /const \[dateFilterTouched, setDateFilterTouched\] = useState\(false\);/);
  assert.match(source, /date:\s*dateFilterTouched\s*\?/);
  assert.match(source, /setDateFilterTouched\(true\)/);
});

test('歷史今彩539真實使用 .2px 底線且 Matrix Explore 不洩漏', () => {
  assert.doesNotMatch(balls, /\.matrix-explore-main-screen \.history-panel/);
  assert.match(balls, /\.matrix-explore-main-screen \.matrix-explore-history-panel/);
  assert.match(balls, /\.draw-history-screen \.draw-history-panel\[data-lottery="今彩539"\][^}]*--underline-y:\s*\.2px;/s);
});

test('通知與底部品牌頁移除固定 Logo 特例和小螢幕強拉', () => {
  assert.match(feature, /\.notifications-screen \.feature-body\s*\{[^}]*var\(--layout-bottom-nav-clearance\)/s);
  assert.doesNotMatch(feature, /\.notifications-screen \.feature-body\s*\{[^}]*--mobile-safe-area-height/s);
  assert.doesNotMatch(responsive, /\.bottom-nav-brand-screen \.shared-brand-logo\s*\{[^}]*width:\s*75%/s);
  assert.doesNotMatch(responsive, /bottom-nav-brand-screen\.notifications-screen[^}]*margin-bottom:\s*4px/s);
  assert.doesNotMatch(responsive, /@media \(max-width:\s*360px\)[\s\S]*?notification-heading/);
  assert.match(responsive, /\.notification-heading\s*\{[^}]*grid-template-columns:\s*clamp\(/s);
});

test('同星結果列增加背景與群組分隔辨識', () => {
  assert.match(tongxing, /--group-divider-width:\s*3px;/);
  assert.match(tongxing, /data-row-type="locked"[^}]*rgba\(126, 83, 15, \.24\)/s);
  assert.match(tongxing, /data-row-type="predicted"[^}]*rgba\(10, 61, 88, \.25\)/s);
});

test('臨時底部安全區 override 已移除', () => {
  assert.doesNotMatch(explore, /--layout-bottom-nav-clearance:[^;]*--mobile-safe-area-height/);
  assert.doesNotMatch(feature, /\.calculator-screen > \.feature-body\s*\{[^}]*80px/s);
  assert.doesNotMatch(main, /bottom-nav-responsive-clearance\.css/);
  assert.equal(fs.existsSync('src/bottom-nav-responsive-clearance.css'), false);
});
