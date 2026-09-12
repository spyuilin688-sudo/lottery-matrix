import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ruleBodies } from './helpers/css-rules.mjs';

const source = readFeaturePagesSource();
const css = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
const tongxingCss = readFileSync(new URL('../src/tongxing-compact.css', import.meta.url), 'utf8');
const responsiveCss = readFileSync(new URL('../src/responsive-feature-pages.css', import.meta.url), 'utf8');
const brandCss = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../src/design-tokens.css', import.meta.url), 'utf8');
const brandSource = readFileSync(new URL('../src/BrandLogo.tsx', import.meta.url), 'utf8');
const adjustmentsCss = readFileSync(new URL('../src/feature-page-adjustments.css', import.meta.url), 'utf8');

test('歷史開獎使用內容驅動的精簡按鈕及 sticky 頁首 [header migration]', () => {
  assert.match(source, /className="draw-history-screen sticky-title-card-screen"/);
  assert.match(css, /\.sticky-title-card-screen > \.product-header,\s*\.number-reference-screen > \.product-header\s*\{[^}]*position:\s*sticky;[^}]*z-index:\s*30;[^}]*top:\s*0;/s);
  assert.doesNotMatch(responsiveCss, /feature-brand-header/);
});

test('歷史、同星、對照單使用 16px 水平外距並由標題卡提供 8px 垂直間距 [header migration]', () => {
  assert.match(tokens, /--layout-page-inline:\s*16px;/);
  assert.match(css, /\.product-header\s*\{[^}]*width:\s*100%;[^}]*padding:\s*0 var\(--layout-page-inline\) 8px;/s);
  for (const selector of [/^\.draw-history-screen \.feature-body$/, /^\.tongxing-screen \.feature-body$/, /^\.number-reference-screen \.feature-body$/]) {
    const bodies = ruleBodies(responsiveCss, selector);
    assert.equal(bodies.length, 1);
    assert.match(bodies[0], /padding:\s*0 var\(--tool-page-inline\)/);
  }
});

test('號碼對照單標題操作使用共用控制項尺寸、內容寬度區域與自適應文字 [header migration]', () => {
  const css = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
  const actions = ruleBodies(css, /^\.product-header__actions$/);
  assert.equal(actions.length, 1);
  assert.match(actions[0], /grid-area:\s*actions;/);
  assert.match(actions[0], /min-width:\s*0;/);
  assert.doesNotMatch(actions[0], /translate|position:\s*absolute/);
  assert.match(source, /reference-title-actions title-card-compact-actions/);
  assert.match(source, /reference-refresh-trigger[\s\S]*刷新/);
  assert.match(source, /reference-settings-trigger[\s\S]*探索設定/);
});

test('對照單浮動探索設定維持原本三欄排列', () => {
  assert.match(css, /\.reference-query-panel \.query-selects\.three-cols\s*\{[^}]*grid-template-columns:\s*minmax\(0, \.85fr\) minmax\(0, \.8fr\) minmax\(0, 1\.75fr\)/s);
  assert.doesNotMatch(css, /\.number-reference-screen \.query-selects\.three-cols/);
});

test('Matrix 同星設定可收合、頁首固定且不渲染近10期卡片', () => {
  assert.match(source, /const \[settingsExpanded, setSettingsExpanded\] = useState\(true\)/);
  assert.match(source, /aria-label=\{settingsExpanded \? "收合同星探索設定" : "展開同星探索設定"\}/);
  assert.match(source, /className="panel tongxing-query tongxing-panel-scope"/);
  assert.match(source, /role=\{settingsFloating \? "dialog" : "region"\}/);
  assert.match(source, /aria-label="同星探索設定"/);
  assert.match(source, /hidden=\{!settingsExpanded\}/);
  const start = source.indexOf('export function TongXingPage');
  const end = source.indexOf('export function NumberReferencePage', start);
  const page = source.slice(start, end);
  assert.doesNotMatch(page, /<HistoryList/);
  assert.match(page, /className="tongxing-screen sticky-title-card-screen"/);
});

test('快捷通知我的共用首頁 matrixya Logo 幾何與 8px 間距 [header migration]', () => {
  const header = readFileSync(new URL('../src/features/BrandHeader.tsx', import.meta.url), 'utf8');
  assert.match(header, /matrixYY\.png/);
  assert.match(brandCss, /\.product-header\s*\{[^}]*width:\s*100%;[^}]*padding:\s*0 var\(--layout-page-inline\) 8px;/s);
  assert.doesNotMatch(responsiveCss, /matrix-title-banner|feature-brand-header/);
});

test('通知頁使用 v2 緊密密度且右側動作固定欄對齊', () => {
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.notification-heading\s*\{[^}]*padding:\s*4px 8px 4px 4px;/s);
  assert.match(responsiveCss, /\.notifications-screen \.feature-body\s*\{[^}]*gap:\s*4px/s);
  assert.match(adjustmentsCss, /\.notifications-screen-v2\s*\{[^}]*--notification-bulk-inline:\s*18px;[^}]*--notification-list-inline:\s*16px;/s);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.feature-body\s*\{[^}]*padding-inline:\s*var\(--notification-bulk-inline\);[^}]*padding-block-start:\s*4px;[^}]*padding-block-end:\s*calc\(var\(--layout-bottom-nav-clearance\) \+ 8px\);/s);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.notification-list\s*\{[^}]*margin-inline:\s*calc\(var\(--notification-list-inline\) - var\(--notification-bulk-inline\)\);/s);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.notification-actions\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*56px 38px;[^}]*gap:\s*8px/s);
  assert.doesNotMatch(responsiveCss, /\.notification-row\s*\{[^}]*grid-template-columns:/s);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.notification-icon,[\s\S]*?width:\s*36px;[^}]*height:\s*36px/s);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.notification-settings-toggle\s*\{[^}]*width:\s*56px;[^}]*height:\s*20px/s);
  assert.doesNotMatch(responsiveCss, /@media \(max-width: 360px\)[\s\S]*?notification-heading/);
  assert.match(responsiveCss, /\.notification-row h2\s*\{[^}]*font-size:\s*14px;[^}]*line-height:\s*18px;/s);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.notification-actions > \.toggle\s*\{[^}]*width:\s*38px;[^}]*height:\s*18px;/s);
});

test('舊按鈕規則不再覆蓋正式精簡規格', () => {
  assert.doesNotMatch(css, /\.draw-history-screen \.history-title-actions \.history-filter-trigger\s*\{/);
  assert.doesNotMatch(css, /\.reference-title-actions button\s*\{/);
});

test('本次正式規則不新增整頁縮放、負位移或 important 補償', () => {
  const screenContract = ruleBodies(responsiveCss, /^\.draw-history-screen$/);
  assert.equal(screenContract.length, 1);
  assert.match(screenContract[0], /--tool-page-inline:\s*var\(--layout-page-inline\);/);
  assert.match(screenContract[0], /--tool-section-gap:\s*var\(--layout-section-gap, 8px\);/);
  assert.doesNotMatch(responsiveCss, /!important/);
  assert.doesNotMatch(responsiveCss, /margin(?:-inline|-left|-right|-top)?:\s*-/);
  assert.doesNotMatch(responsiveCss, /scale\(/);
});


test('號碼對照單刷新圖示不再有頁面專屬尺寸覆寫', () => {
  assert.doesNotMatch(responsiveCss, /\.number-reference-screen \.reference-refresh-trigger > svg\s*\{/);
});

