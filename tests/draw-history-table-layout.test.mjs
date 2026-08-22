import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const ballCss = readFileSync(new URL("../src/number-ball.css", import.meta.url), "utf8");
const matrixCss = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");
const responsiveCss = readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const prototypeSource = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");
const prototypeCss = readFileSync(new URL("../src/prototype.css", import.meta.url), "utf8");

test("正式樣式表由入口直接載入以確保部署重新編譯", () => {
  assert.match(prototypeSource, /import "\.\/feature-pages\.css";/);
  assert.doesNotMatch(prototypeCss, /@import\s+"\.\/feature-pages\.css/);
});

test("歷史開獎沿用近10期正式表格結構及響應式作用域", () => {
  assert.match(source, /className="matrix-explore-main-screen draw-history-history-scope"/);
  assert.match(source, /className="panel history-panel draw-history-panel"/);
  assert.match(source, /className="history-row draw-history-row history-head draw-history-head"/);
  assert.match(source, /className="history-row draw-history-row"/);
  assert.match(matrixCss, /\.matrix-explore-main-screen \.history-row\s*\{[^}]*grid-template-columns:/s);
  assert.match(matrixCss, /\.matrix-explore-main-screen \.history-panel:is\([^}]+\) \.history-row:not\(\.history-head\)\s*\{[^}]*height:/s);
});

test("歷史開獎不再覆寫近10期欄寬、列高與文字位置", () => {
  assert.doesNotMatch(css, /\.draw-history-row\s*\{[^}]*grid-template-columns:/s);
  assert.doesNotMatch(css, /\.draw-history-row\s*\{[^}]*height:/s);
  assert.doesNotMatch(css, /\.draw-history-row \.draw-history-meta:first-child\s*\{/s);
  assert.doesNotMatch(css, /\.draw-history-screen \.history-date-stack (?:strong|small)\s*\{/s);
  assert.match(css, /\.draw-history-week-list\s*\{[^}]*gap:\s*8px/s);
});

test("歷史今彩539只保留明確的 .2px 數字底線間距，不受 Matrix Explore 尺寸規則誤套", () => {
  assert.match(ballCss, /\.draw-history-screen \.draw-history-panel\[data-lottery="今彩539"\] \.number-ball-component\.history-lottery-ball\s*\{[^}]*--underline-y:\s*\.2px;/s);
  assert.doesNotMatch(ballCss, /\.matrix-explore-main-screen \.history-panel/);
  assert.match(ballCss, /\.matrix-explore-main-screen \.matrix-explore-history-panel/);
});

test("篩選條件位於歷史標題卡右下角且操作高度為 27.4px", () => {
  assert.match(css, /\.draw-history-screen \.matrix-title-banner-actions\s*\{[^}]*right:\s*4%[^}]*bottom:\s*8%/s);
  assert.match(css, /\.draw-history-screen \.matrix-title-banner-actions \.history-title-actions\s*\{[^}]*align-items:\s*flex-end/s);
  assert.match(responsiveCss, /\.title-card-compact-action\s*\{[^}]*height:\s*27\.4px;[^}]*min-height:\s*27\.4px;/s);
});

test("彩種下拉為歷史設定卡第一項並保留標題列篩選按鈕", () => {
  const panelStart = source.indexOf('className="history-filter-panel"');
  const primaryStart = source.indexOf('<div className="history-filter-primary-row">', panelStart);
  const lotterySelect = source.indexOf('aria-label="彩種"', primaryStart);
  const orderSelect = source.indexOf('aria-label="號碼順序"', primaryStart);
  const secondaryStart = source.indexOf('<div className="history-filter-secondary-row">', primaryStart);
  const titleActions = source.indexOf('const historyTitleActions');
  const filterTrigger = source.indexOf('className="history-filter-trigger title-card-compact-action"', titleActions);
  const shellAction = source.indexOf('headerAction={historyTitleActions}', titleActions);

  assert.ok(panelStart >= 0);
  assert.ok(primaryStart > panelStart);
  assert.ok(lotterySelect > primaryStart && lotterySelect < orderSelect);
  assert.ok(orderSelect < secondaryStart);
  assert.ok(titleActions >= 0 && filterTrigger > titleActions && shellAction > filterTrigger);
  assert.doesNotMatch(source, /history-title-lottery|history-title-chevron/);
  assert.doesNotMatch(css, /history-title-lottery|history-title-chevron/);
});

test("歷史設定卡維持原控制尺寸、改直角矩形選項並支援響應式文字", () => {
  assert.match(source, /className="history-filter-panel"/);
  assert.match(source, /className="history-filter-primary-row"/);
  assert.match(source, /className="history-filter-secondary-row"/);
  assert.match(css, /\.history-filter-panel \.select-box,[\s\S]*?height:\s*26px/s);
  assert.match(css, /\.history-filter-panel \.select-box\s*\{[^}]*border-radius:\s*0;/s);
  assert.match(css, /\.history-filter-panel \.select-box::before,[\s\S]*?\.history-filter-panel \.select-box::after\s*\{\s*display:\s*none;/s);
  assert.match(css, /\.history-filter-panel select\s*\{[^}]*font-size:\s*clamp\(/s);
  assert.match(responsiveCss, /\.draw-history-screen \.feature-body\s*\{[^}]*padding-inline:\s*20px;[^}]*gap:\s*12px/s);
});