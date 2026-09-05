import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

const css = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const ballCss = readFileSync(new URL("../src/number-ball.css", import.meta.url), "utf8");
const matrixCss = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");
const responsiveCss = readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");
const source = readFeaturePagesSource();
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
  const bodies = ruleBodies(
    ballCss,
    /^\.draw-history-screen \.draw-history-panel:is\(\[data-lottery="今彩539"\], \[data-lottery="天天樂"\]\) \.number-ball-component\.history-lottery-ball$/,
  );
  assert.equal(bodies.length, 1);
  assert.match(bodies[0], /--underline-y:\s*\.2px;/);
  assert.doesNotMatch(ballCss, /\.matrix-explore-main-screen \.history-panel/);
  assert.match(ballCss, /\.matrix-explore-main-screen \.matrix-explore-history-panel/);
});

test("篩選條件由標題卡內容寬度與內容驅動的精簡控制器承接", () => {
  const actionBodies = ruleBodies(
    responsiveCss,
    /^\.draw-history-screen \.matrix-title-banner-actions$/,
  );
  assert.equal(actionBodies.length, 1);
  assert.match(actionBodies[0], /top:\s*100%;/);
  assert.match(actionBodies[0], /bottom:\s*auto;/);
  assert.match(actionBodies[0], /width:\s*auto;/);
  assert.match(actionBodies[0], /transform:\s*translateY\(-87\.5%\);/);

  const controlBodies = ruleBodies(
    responsiveCss,
    /^\.draw-history-screen \.history-title-actions \.title-card-compact-action$/,
  );
  assert.equal(controlBodies.length, 1);
  assert.doesNotMatch(controlBodies[0], /(?:^|;)\s*(?:min-)?height\s*:/);
  assert.match(controlBodies[0], /padding-inline:\s*4px;/);
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

test("歷史設定卡維持 26px 控制、深色直角選項與共享 16px 水平外距", () => {
  assert.match(source, /className="history-filter-panel"/);
  assert.match(source, /className="history-filter-primary-row"/);
  assert.match(source, /className="history-filter-secondary-row"/);
  assert.ok(ruleBodies(css, /^\.history-filter-panel \.select-box$/).some((body) => /height:\s*26px;/.test(body)));
  assert.match(css, /\.history-filter-panel \.select-box\s*\{[^}]*border-radius:\s*0;/s);
  assert.ok(ruleBodies(css, /^\.history-filter-panel \.select-box::after$/).some((body) => /display:\s*none;/.test(body)));
  assert.match(css, /\.history-filter-panel select\s*\{[^}]*font-size:\s*clamp\(/s);
  const bodyRules = ruleBodies(responsiveCss, /^\.draw-history-screen \.feature-body$/);
  assert.equal(bodyRules.length, 1);
  assert.match(bodyRules[0], /padding:\s*0 var\(--tool-page-inline\) calc\(var\(--layout-bottom-nav-clearance\) \+ 8px\);/);
  assert.match(responsiveCss, /--tool-page-inline:\s*var\(--layout-page-inline\);/);
});
