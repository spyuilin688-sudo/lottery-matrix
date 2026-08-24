import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ruleBodies } from './helpers/css-rules.mjs';

const source = readFileSync(new URL('../src/FeaturePages.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
const tongxingCss = readFileSync(new URL('../src/tongxing-compact.css', import.meta.url), 'utf8');
const responsiveCss = readFileSync(new URL('../src/responsive-feature-pages.css', import.meta.url), 'utf8');
const brandCss = readFileSync(new URL('../src/brand-header-unify.css', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../src/design-tokens.css', import.meta.url), 'utf8');
const brandSource = readFileSync(new URL('../src/BrandLogo.tsx', import.meta.url), 'utf8');
const adjustmentsCss = readFileSync(new URL('../src/feature-page-adjustments.css', import.meta.url), 'utf8');

test('歷史開獎使用 24.7px 基底與 22px 專用精簡按鈕及 sticky 頁首', () => {
  assert.match(source, /className="history-filter-panel"/);
  assert.match(source, /role=\{filterFloating \? "dialog" : "region"\}/);
  assert.match(source, /aria-label="歷史篩選設定"/);
  assert.match(source, /className="history-filter-trigger title-card-compact-action"/);
  assert.match(source, /className="draw-history-screen sticky-title-card-screen"/);
  assert.match(responsiveCss, /\.title-card-compact-action\s*\{[^}]*height:\s*24\.7px;[^}]*min-height:\s*24\.7px;[^}]*gap:\s*2px;[^}]*font-size:\s*clamp\(7\.2px, 2\.1vw, 9px\)/s);
  const historyControl = ruleBodies(responsiveCss, /^\.draw-history-screen \.history-title-actions \.title-card-compact-action$/);
  assert.equal(historyControl.length, 1);
  assert.match(historyControl[0], /height:\s*22px;/);
  assert.match(historyControl[0], /min-height:\s*22px;/);
  const before = responsiveCss.match(/\.title-card-compact-action::before\s*\{[^}]*\}/s)?.[0] ?? '';
  const after = ruleBodies(responsiveCss, /^\.title-card-compact-action::after$/)
    .find((body) => /height:\s*22\.7px/.test(body)) ?? '';
  assert.match(before, /height:\s*24\.7px/);
  assert.match(after, /height:\s*22\.7px/);
  assert.match(after, /background:\s*var\(--select-tech-surface, #030b13\)/);
  assert.doesNotMatch(before, /clip-path/);
  assert.doesNotMatch(after, /clip-path/);
  const stickyHeader = ruleBodies(responsiveCss, /^\.sticky-title-card-screen \.feature-brand-header$/);
  assert.equal(stickyHeader.length, 1);
  assert.match(stickyHeader[0], /position:\s*sticky;/);
});

test('歷史、同星、對照單內容與標題卡共用目前 16px 工具頁外距', () => {
  assert.match(tokens, /--layout-page-inline:\s*12px;/);
  assert.match(responsiveCss, /--tool-page-inline:\s*16px;/);
  for (const selector of [
    /^\.draw-history-screen \.feature-body$/,
    /^\.tongxing-screen \.feature-body$/,
    /^\.number-reference-screen \.feature-body$/,
  ]) {
    const bodies = ruleBodies(responsiveCss, selector);
    assert.equal(bodies.length, 1);
    assert.match(bodies[0], /width:\s*100%;/);
    assert.match(bodies[0], /padding:\s*var\(--tool-section-gap\) var\(--tool-page-inline\) var\(--layout-bottom-nav-clearance\);/);
    assert.match(bodies[0], /row-gap:\s*var\(--tool-section-gap\);/);
  }
  const titleBodies = ruleBodies(responsiveCss, /^\.number-reference-screen \.matrix-title-banner$/);
  assert.equal(titleBodies.length, 1);
  assert.match(titleBodies[0], /width:\s*calc\(100% - \(var\(--tool-page-inline\) \* 2\)\);/);
  assert.doesNotMatch(tongxingCss, /\.tongxing-screen \.feature-body\s*\{/);
});

test('號碼對照單標題操作使用內容寬度區域、7px 刷新圖示與自適應文字', () => {
  assert.match(source, /className="reference-title-actions title-card-compact-actions"/);
  assert.match(source, /<ReloadIcon className="reference-refresh-icon" \/>刷新/);
  assert.match(source, /className="title-card-compact-action"[^>]*aria-label=\{queryExpanded/);
  assert.match(responsiveCss, /\.number-reference-screen \.reference-title-actions\s*\{\s*gap:\s*8px;/s);
  const actionBodies = ruleBodies(responsiveCss, /^\.number-reference-screen \.matrix-title-banner-actions$/);
  assert.equal(actionBodies.length, 1);
  assert.match(actionBodies[0], /width:\s*auto;/);
  const iconBodies = ruleBodies(responsiveCss, /^\.number-reference-screen \.reference-title-actions button:first-child > svg$/);
  assert.equal(iconBodies.length, 1);
  assert.match(iconBodies[0], /width:\s*7px;/);
  assert.match(iconBodies[0], /height:\s*7px;/);
  assert.doesNotMatch(brandCss, /\.number-reference-screen \.reference-title-actions button:(?:first|last)-child/);
  assert.match(css, /\.number-reference-screen \.reference-select select\s*\{[^}]*font-size:\s*clamp\(/s);
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

test('快捷通知我的共用首頁 matrixya Logo 幾何與 8px 間距', () => {
  assert.match(brandSource, /matrixya\.png/);
  assert.match(brandCss, /\.feature-brand-header,[\s\S]*?\{[^}]*margin:\s*0 auto var\(--layout-section-gap\)/s);
  assert.match(brandCss, /\.feature-brand-lockup,[\s\S]*?\.shared-brand-logo\s*\{[^}]*width:\s*100%;[^}]*height:\s*var\(--primary-brand-height\)/s);
  assert.match(tokens, /--layout-section-gap:\s*8px;/);
  assert.doesNotMatch(responsiveCss, /\.bottom-nav-brand-screen \.shared-brand-logo\s*\{[^}]*width:\s*75%/s);
  assert.doesNotMatch(responsiveCss, /\.bottom-nav-brand-screen\.notifications-screen > \.feature-brand-header:not\(\.integrated-title-header\)/);
});

test('通知頁使用單一 clamp 響應式密度且不保留小螢幕強拉覆寫', () => {
  assert.match(responsiveCss, /\.notification-row\s*\{[^}]*height:\s*auto[^}]*min-height:\s*0[^}]*padding:\s*4px/s);
  assert.match(responsiveCss, /\.notifications-screen \.feature-body\s*\{[^}]*gap:\s*4px/s);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.feature-body\s*\{[^}]*padding:\s*0 16px/s);
  assert.match(responsiveCss, /\.notification-heading\s*\{[^}]*grid-template-columns:\s*clamp\(40px, 12\.3vw, 48px\) minmax\(0, 1fr\) clamp\(64px, 19\.5vw, 76px\) 42px;[^}]*column-gap:\s*clamp\(4px, 1\.5vw, 6px\)/s);
  assert.doesNotMatch(responsiveCss, /\.notification-row\s*\{[^}]*grid-template-columns:/s);
  assert.match(responsiveCss, /\.notification-icon\s*\{[^}]*width:\s*clamp\(40px, 11\.3vw, 44px\);[^}]*height:\s*clamp\(40px, 11\.3vw, 44px\)/s);
  assert.match(responsiveCss, /\.notification-actions > button:first-child\s*\{[^}]*width:\s*clamp\(64px, 18\.5vw, 72px\);[^}]*height:\s*32px/s);
  assert.doesNotMatch(responsiveCss, /@media \(max-width: 360px\)[\s\S]*?notification-heading/);
  assert.match(responsiveCss, /\.notification-row h2\s*\{[^}]*font-size:\s*14px;[^}]*line-height:\s*18px;/s);
  assert.match(responsiveCss, /\.notification-heading \.toggle\s*\{[^}]*width:\s*42px;[^}]*height:\s*44px;/s);
});

test('舊按鈕規則不再覆蓋正式精簡規格', () => {
  assert.doesNotMatch(css, /\.draw-history-screen \.history-title-actions \.history-filter-trigger\s*\{/);
  assert.doesNotMatch(css, /\.reference-title-actions button\s*\{/);
});

test('本次正式規則不新增整頁縮放、負位移或 important 補償', () => {
  const screenContract = ruleBodies(responsiveCss, /^\.draw-history-screen$/);
  assert.equal(screenContract.length, 1);
  assert.match(screenContract[0], /--tool-page-inline:\s*16px;/);
  assert.match(screenContract[0], /--tool-section-gap:\s*var\(--layout-section-gap, 8px\);/);
  assert.doesNotMatch(responsiveCss, /!important/);
  assert.doesNotMatch(responsiveCss, /margin(?:-inline|-left|-right|-top)?:\s*-/);
  assert.doesNotMatch(responsiveCss, /scale\(/);
});
