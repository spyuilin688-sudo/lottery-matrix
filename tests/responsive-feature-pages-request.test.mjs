import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/FeaturePages.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
const tongxingCss = readFileSync(new URL('../src/tongxing-compact.css', import.meta.url), 'utf8');
const responsiveCss = readFileSync(new URL('../src/responsive-feature-pages.css', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../src/design-tokens.css', import.meta.url), 'utf8');
const brandSource = readFileSync(new URL('../src/BrandLogo.tsx', import.meta.url), 'utf8');

test('歷史開獎使用篩選設定文案、共用精簡按鈕及 sticky 頁首', () => {
  assert.match(source, /history-filter-trigger-icon[^>]*>[\s\S]*?篩選設定\s*<\/button>/);
  assert.match(source, /id="history-filter-title">篩選設定<\/h2>/);
  assert.match(source, /className="history-filter-trigger title-card-compact-action"/);
  assert.match(source, /className="draw-history-screen sticky-title-card-screen"/);
  assert.match(responsiveCss, /\.title-card-compact-action\s*\{[^}]*height:\s*23\.4px[^}]*font-size:\s*8\.1px/s);
  assert.match(responsiveCss, /\.sticky-title-card-screen \.feature-brand-header\s*\{[^}]*position:\s*sticky/s);
  assert.match(responsiveCss, /\.draw-history-screen \.matrix-title-banner-actions\s*\{[^}]*transform:\s*translateY\(4px\)/s);
});

test('歷史列表及功能頁使用唯一 12px 外距 token', () => {
  assert.match(tokens, /--layout-page-inline:\s*12px;/);
  assert.match(responsiveCss, /\.draw-history-screen \.feature-body,[^{]*\{[^}]*padding-inline:\s*var\(--layout-page-inline\)/s);
  assert.match(responsiveCss, /\.draw-history-screen \.feature-body,[^{]*\.number-reference-screen \.feature-body,[^{]*\.tongxing-screen \.feature-body,[^{]*\{[^}]*padding-inline:\s*var\(--layout-page-inline\)/s);
});

test('號碼對照單標題操作共用按鈕規格且相距 6px', () => {
  assert.match(source, /className="reference-title-actions title-card-compact-actions"/);
  assert.match(source, /className="title-card-compact-action"[^>]*>\s*<ReloadIcon \/>刷新/);
  assert.match(source, /className="title-card-compact-action"[^>]*aria-label=\{queryExpanded/);
  assert.match(responsiveCss, /\.reference-title-actions\s*\{[^}]*gap:\s*6px/s);
  assert.match(responsiveCss, /\.number-reference-screen \.reference-row:not\(\.head\)\s*\{[^}]*min-height:\s*32px/s);
});

test('Matrix 同星設定可收合、頁首固定且不渲染近10期卡片', () => {
  assert.match(source, /const \[settingsExpanded, setSettingsExpanded\] = useState\(true\)/);
  assert.match(source, /aria-label=\{settingsExpanded \? "收合同星探索設定" : "展開同星探索設定"\}/);
  assert.match(source, /aria-label="同星探索設定" hidden=\{!settingsExpanded\}/);
  const start = source.indexOf('export function TongXingPage');
  const end = source.indexOf('export function NumberReferencePage', start);
  const page = source.slice(start, end);
  assert.doesNotMatch(page, /<HistoryList/);
  assert.match(page, /className="tongxing-screen sticky-title-card-screen"/);
});

test('快捷通知我的共用首頁 matrixya Logo 幾何', () => {
  assert.match(brandSource, /matrixya\.png/);
  assert.match(responsiveCss, /\.bottom-nav-brand-screen \.shared-brand-logo\s*\{[^}]*width:\s*75%/s);
  assert.doesNotMatch(responsiveCss, /\.bottom-nav-brand-screen \.shared-brand-logo\s*\{[^}]*(?:transform|margin-top:\s*-)/s);
});

test('通知與我的頁採緊湊但可操作的密度', () => {
  assert.match(responsiveCss, /\.notification-row\s*\{[^}]*height:\s*64px/s);
  assert.match(responsiveCss, /\.notification-icon\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
  assert.match(responsiveCss, /\.notification-actions > button:first-child\s*\{[^}]*width:\s*72px[^}]*height:\s*32px/s);
  assert.match(responsiveCss, /\.profile-card\s*\{[^}]*padding:\s*8px 12px/s);
  assert.match(responsiveCss, /\.profile-avatar\s*\{[^}]*width:\s*54px[^}]*height:\s*54px/s);
  assert.match(responsiveCss, /\.profile-menu-rows button\s*\{[^}]*height:\s*36px/s);
});

test('本次正式規則不新增整頁縮放、負位移或 important 補償', () => {
  assert.match(responsiveCss, /\/\* Responsive feature pages formal source \*\//);
  assert.doesNotMatch(responsiveCss, /!important/);
  assert.doesNotMatch(responsiveCss, /margin(?:-inline|-left|-right|-top)?:\s*-/);
  assert.doesNotMatch(responsiveCss, /scale\(/);
});
