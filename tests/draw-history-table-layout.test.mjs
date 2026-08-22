import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const ballCss = readFileSync(new URL("../src/number-ball.css", import.meta.url), "utf8");
const matrixCss = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");
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

test("歷史開獎彩球、數字及底線不再另設覆寫值", () => {
  assert.doesNotMatch(ballCss, /\.draw-history-screen \.draw-history-row \.number-ball-component\.history-lottery-ball/);
  assert.match(ballCss, /\.history-panel \.number-ball-component\.history-lottery-ball/);
  assert.match(ballCss, /--underline-width:/);
});

test("篩選條件位於歷史標題卡右下角", () => {
  assert.match(css, /\.draw-history-screen \.matrix-title-banner-actions\s*\{[^}]*right:\s*4%[^}]*bottom:\s*8%/s);
  assert.match(css, /\.draw-history-screen \.matrix-title-banner-actions \.history-title-actions\s*\{[^}]*align-items:\s*flex-end/s);
});

test("彩種下拉移入篩選條件第一項並保留標題列篩選按鈕", () => {
  const fieldsStart = source.indexOf('<div className="history-filter-fields">');
  const lotteryIcon = source.indexOf('/assets/lottery/functions/彩種.png', fieldsStart);
  const lotterySelect = source.indexOf('aria-label="彩種"', fieldsStart);
  const issueIcon = source.indexOf('/assets/history-filter/issue.png', fieldsStart);
  const titleActions = source.indexOf('const historyTitleActions');
  const filterTrigger = source.indexOf('className="history-filter-trigger"', titleActions);
  const shellAction = source.indexOf('headerAction={historyTitleActions}', titleActions);

  assert.ok(fieldsStart >= 0);
  assert.ok(lotteryIcon > fieldsStart && lotteryIcon < issueIcon);
  assert.ok(lotterySelect > fieldsStart && lotterySelect < issueIcon);
  assert.ok(titleActions >= 0 && filterTrigger > titleActions && shellAction > filterTrigger);
  assert.doesNotMatch(source, /history-title-lottery|history-title-chevron/);
  assert.doesNotMatch(css, /history-title-lottery|history-title-chevron/);
});

test("歷史篩選沿用探索設定的圖示與分段選項尺寸", () => {
  assert.match(source, /className="filter-sheet history-filter-sheet matrix-explore-main-screen"/);
  assert.match(source, /className="setting-label-icon matrix-explore-setting-icon"/);
  assert.match(source, /className="history-range-options segmented four"/);
  assert.match(matrixCss, /\.matrix-explore-main-screen \.matrix-explore-setting-icon\s*\{[^}]*inline-size:\s*1\.8rem[^}]*block-size:\s*1\.8rem/s);
  assert.doesNotMatch(css, /\.history-filter-icon\s*\{[^}]*width:\s*52px/s);
  assert.doesNotMatch(css, /\.history-range-options button\s*\{[^}]*min-height:\s*40px/s);
});
