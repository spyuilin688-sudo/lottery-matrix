import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/FeaturePages.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
const tongxingCss = readFileSync(new URL('../src/tongxing-compact.css', import.meta.url), 'utf8');
const responsiveCss = readFileSync(new URL('../src/responsive-feature-pages.css', import.meta.url), 'utf8');
const brandCss = readFileSync(new URL('../src/brand-header-unify.css', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../src/design-tokens.css', import.meta.url), 'utf8');
const brandSource = readFileSync(new URL('../src/BrandLogo.tsx', import.meta.url), 'utf8');

test('歷史開獎使用 27.4px 直角精簡按鈕及 sticky 頁首', () => {
  assert.match(source, /className="history-filter-panel"/);
  assert.match(source, /role=\{filterFloating \? "dialog" : "region"\}/);
  assert.match(source, /aria-label="歷史篩選設定"/);
  assert.match(source, /className="history-filter-trigger title-card-compact-action"/);
  assert.match(source, /className="draw-history-screen sticky-title-card-screen"/);
  assert.match(responsiveCss, /\.title-card-compact-action\s*\{[^}]*height:\s*27\.4px;[^}]*min-height:\s*27\.4px;[^}]*gap:\s*0;[^}]*font-size:\s*clamp\(8px, 2\.3vw, 10px\)/s);
  const before = responsiveCss.match(/\.title-card-compact-action::before\s*\{[^}]*\}/s)?.[0] ?? '';
  const after = responsiveCss.match(/\.title-card-compact-action::after\s*\{[^}]*\}/s)?.[0] ?? '';
  assert.match(before, /height:\s*27\.4px/);
  assert.match(after, /height:\s*25\.4px/);
  assert.match(after, /background:\s*var\(--select-tech-surface\)/);
  assert.doesNotMatch(before, /clip-path/);
  assert.doesNotMatch(after, /clip-path/);
  assert.match(responsiveCss, /\.sticky-title-card-screen \.feature-brand-header\s*\{[^}]*position:\s*sticky/s);
});

test('歷史、同星、對照單內容改為 20px 外距，標題卡仍使用 12px token', () => {
  assert.match(tokens, /--layout-page-inline:\s*12px;/);
  assert.match(responsiveCss, /\.draw-history-screen \.feature-body\s*\{[^}]*padding-inline:\s*20px;[^}]*gap:\s*12px;/s);
  assert.match(css, /\.number-reference-screen \.feature-body\s*\{[^}]*width:\s*100%;[^}]*padding-inline:\s*20px;[^}]*row-gap:\s*12px;/s);
  assert.match(tongxingCss, /\.tongxing-screen \.feature-body\s*\{[^}]*width:\s*calc\(100% - 40px\);[^}]*margin-inline:\s*20px;/s);
  assert.match(responsiveCss, /\.draw-history-screen \.matrix-title-banner,[^{]*\.number-reference-screen \.matrix-title-banner,[^{]*\.tongxing-screen \.matrix-title-banner\s*\{[^}]*width:\s*calc\(100% - \(var\(--layout-page-inline\) \* 2\)\)/s);
});

test('號碼對照單標題操作使用 40% 區域、7px 刷新圖示與自適應文字', () => {
  assert.match(source, /className="reference-title-actions title-card-compact-actions"/);
  assert.match(source, /<ReloadIcon className="reference-refresh-icon" \/>刷新/);
  assert.match(source, /className="title-card-compact-action"[^>]*aria-label=\{queryExpanded/);
  assert.match(responsiveCss, /\.reference-title-actions\s*\{[^}]*gap:\s*6px/s);
  assert.match(responsiveCss, /\.number-reference-screen \.matrix-title-banner-actions\s*\{[^}]*width:\s*40%;/s);
  assert.match(responsiveCss, /\.title-card-compact-action \.reference-refresh-icon\s*\{[^}]*width:\s*7px;[^}]*height:\s*7px;/s);
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
  assert.match(responsiveCss, /\.notifications-screen \.feature-body\s*\{[^}]*gap:\s*4px[^}]*padding-inline:\s*20px/s);
  assert.match(responsiveCss, /\.notification-heading\s*\{[^}]*grid-template-columns:\s*clamp\(40px, 12\.3vw, 48px\) minmax\(0, 1fr\) clamp\(64px, 19\.5vw, 76px\) 42px;[^}]*column-gap:\s*clamp\(4px, 1\.5vw, 6px\)/s);
  assert.doesNotMatch(responsiveCss, /\.notification-row\s*\{[^}]*grid-template-columns:/s);
  assert.match(responsiveCss, /\.notification-icon\s*\{[^}]*width:\s*clamp\(40px, 11\.3vw, 44px\);[^}]*height:\s*clamp\(40px, 11\.3vw, 44px\)/s);
  assert.match(responsiveCss, /\.notification-actions > button:first-child\s*\{[^}]*width:\s*clamp\(64px, 18\.5vw, 72px\);[^}]*height:\s*32px/s);
  assert.doesNotMatch(responsiveCss, /@media \(max-width: 360px\)/);
  assert.match(responsiveCss, /\.profile-card\s*\{[^}]*padding:\s*8px 12px/s);
  assert.match(responsiveCss, /\.profile-avatar\s*\{[^}]*width:\s*54px[^}]*height:\s*54px/s);
  assert.match(responsiveCss, /\.profile-menu-rows button\s*\{[^}]*height:\s*36px/s);
});

test('舊按鈕規則不再覆蓋正式精簡規格', () => {
  assert.doesNotMatch(css, /\.draw-history-screen \.history-title-actions \.history-filter-trigger\s*\{/);
  assert.doesNotMatch(css, /\.reference-title-actions button\s*\{/);
});

test('本次正式規則不新增整頁縮放、負位移或 important 補償', () => {
  assert.match(responsiveCss, /\/\* Responsive feature pages formal source \*\//);
  assert.doesNotMatch(responsiveCss, /!important/);
  assert.doesNotMatch(responsiveCss, /margin(?:-inline|-left|-right|-top)?:\s*-/);
  assert.doesNotMatch(responsiveCss, /scale\(/);
});
