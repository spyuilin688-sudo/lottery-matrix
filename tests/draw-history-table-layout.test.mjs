import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

const css = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const ballCss = readFileSync(new URL("../src/number-ball.css", import.meta.url), "utf8");
const matrixCss = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");
const responsiveCss = readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");
const historyReadabilityCss = readFileSync(new URL("../src/draw-history-readability.css", import.meta.url), "utf8");
const source = readFeaturePagesSource();
const coreSource = readFileSync(new URL("../src/FeaturePagesCore.tsx", import.meta.url), "utf8");
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

test("歷史今彩539與天天樂增加呼吸空間且不影響六加一彩種", () => {
  assert.match(coreSource, /import "\.\/draw-history-readability\.css";/);

  const fiveBallPanel = ruleBodies(
    historyReadabilityCss,
    /^\.draw-history-screen \.draw-history-panel:is\(\[data-lottery="今彩539"\], \[data-lottery="天天樂"\]\)$/,
  );
  assert.equal(fiveBallPanel.length, 1);
  assert.match(fiveBallPanel[0], /--mx-history-row-height:\s*59px;/);

  const fiveBallSpacing = ruleBodies(
    historyReadabilityCss,
    /^\.draw-history-screen \.draw-history-panel:is\(\[data-lottery="今彩539"\], \[data-lottery="天天樂"\]\) \.history-main-numbers$/,
  );
  assert.equal(fiveBallSpacing.length, 1);
  assert.match(fiveBallSpacing[0], /gap:\s*clamp\(5px,\s*2vw,\s*8px\);/);

  const fiveBallHeadDivider = ruleBodies(
    historyReadabilityCss,
    /^\.draw-history-screen \.draw-history-panel:is\(\[data-lottery="今彩539"\], \[data-lottery="天天樂"\]\) \.history-row\.history-head$/,
  );
  assert.equal(fiveBallHeadDivider.length, 1);
  assert.match(fiveBallHeadDivider[0], /border-bottom:\s*1px solid rgba\(212,\s*169,\s*83,\s*\.48\);/);

  const fiveBallRowDivider = ruleBodies(
    historyReadabilityCss,
    /^\.draw-history-screen \.draw-history-panel:is\(\[data-lottery="今彩539"\], \[data-lottery="天天樂"\]\) \.history-row:not\(\.history-head\)$/,
  );
  assert.equal(fiveBallRowDivider.length, 1);
  assert.match(fiveBallRowDivider[0], /border-bottom:\s*1px solid rgba\(212,\s*169,\s*83,\s*\.36\);/);

  const fiveBallColumnDividers = ruleBodies(
    historyReadabilityCss,
    /^\.draw-history-screen \.draw-history-panel:is\(\[data-lottery="今彩539"\], \[data-lottery="天天樂"\]\) \.history-row > :nth-child\([12]\)$/,
  );
  assert.equal(fiveBallColumnDividers.length, 1);
  assert.match(
    historyReadabilityCss,
    /\.draw-history-screen \.draw-history-panel:is\(\[data-lottery="今彩539"\], \[data-lottery="天天樂"\]\) \.history-row > :nth-child\(1\),\s*\.draw-history-screen \.draw-history-panel:is\(\[data-lottery="今彩539"\], \[data-lottery="天天樂"\]\) \.history-row > :nth-child\(2\)/s,
  );
  assert.match(fiveBallColumnDividers[0], /border-right:\s*1px solid rgba\(212,\s*169,\s*83,\s*\.32\);/);

  const fiveBallSize = ruleBodies(
    ballCss,
    /^\.draw-history-screen \.draw-history-panel:is\(\[data-lottery="今彩539"\], \[data-lottery="天天樂"\]\) \.number-ball-component\.history-lottery-ball$/,
  );
  assert.equal(fiveBallSize.length, 1);
  assert.match(fiveBallSize[0], /--number-ball-size:\s*clamp\(23px,\s*6\.8vw,\s*26px\);/);
  assert.match(fiveBallSize[0], /--number-font-size:\s*clamp\(12px,\s*3\.4vw,\s*13\.5px\);/);

  const markSixPanel = ruleBodies(
    responsiveCss,
    /^\.draw-history-screen \.draw-history-panel\[data-lottery="六合彩"\]$/,
  );
  assert.equal(markSixPanel.length, 1);
  assert.match(markSixPanel[0], /--matrix-history-ball-size:\s*clamp\(18px,\s*5\.64vw,\s*22px\);/);

  const grandLottoPanel = ruleBodies(
    responsiveCss,
    /^\.draw-history-screen \.draw-history-panel\[data-lottery="大樂透"\]$/,
  );
  assert.equal(grandLottoPanel.length, 1);
  assert.match(grandLottoPanel[0], /--matrix-history-ball-size:\s*clamp\(20px,\s*6\.15vw,\s*24px\);/);
});

test("篩選條件由標題卡內容寬度與內容驅動的精簡控制器承接 [header migration]", () => {
  const css = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
  const actions = ruleBodies(css, /^\.product-header__actions$/);
  assert.equal(actions.length, 1);
  assert.match(actions[0], /position:\s*absolute;/);
  assert.match(actions[0], /right:\s*4px;/);
  assert.match(actions[0], /bottom:\s*0px;/);
  assert.match(actions[0], /width:\s*var\(--product-header-action-width\);/);
  assert.match(actions[0], /min-width:\s*0;/);
  assert.doesNotMatch(actions[0], /translate/);
  const control = ruleBodies(responsiveCss, /^\.title-card-compact-action$/);
  assert.equal(control.length, 1);
  assert.match(control[0], /padding:\s*2px 1px;/);
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

test("歷史設定卡維持 26px 控制、第二列共用深色細框選項與共享 16px 水平外距", () => {
  assert.match(source, /className="history-filter-panel"/);
  assert.match(source, /className="history-filter-primary-row"/);
  assert.match(source, /className="history-filter-secondary-row"/);
  assert.ok(ruleBodies(css, /^\.history-filter-panel \.select-box$/).some((body) => /height:\s*26px;/.test(body)));
  const select = ruleBodies(css, /^\.select-box$/);
  assert.equal(select.length, 1);
  assert.match(select[0], /border:\s*1px solid var\(--pwa-frame-tertiary\)/);
  assert.match(select[0], /border-radius:\s*var\(--pwa-frame-radius\)/);
  assert.match(css, /\.history-filter-secondary-row \.select-box\s*\{[^}]*background:\s*var\(--pwa-control-surface\)/s);
  assert.doesNotMatch(css, /\.select-box::(?:before|after)/);
  assert.match(css, /\.history-filter-panel select\s*\{[^}]*font-size:\s*clamp\(/s);
  const bodyRules = ruleBodies(responsiveCss, /^\.draw-history-screen \.feature-body$/);
  assert.equal(bodyRules.length, 1);
  assert.match(bodyRules[0], /padding:\s*0 var\(--tool-page-inline\) calc\(var\(--layout-bottom-nav-clearance\) \+ 8px\);/);
  assert.match(responsiveCss, /--tool-page-inline:\s*var\(--layout-page-inline\);/);
});
