import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const ballCss = readFileSync(new URL("../src/number-ball.css", import.meta.url), "utf8");

test("歷史開獎三欄使用單一正式比例並將前兩欄內容幾何置中", () => {
  assert.match(css, /\.draw-history-row\s*\{[^}]*grid-template-columns:\s*62px 72px minmax\(0, 1fr\)/s);
  assert.match(css, /\.draw-history-row\s*>\s*span\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.draw-history-row\s*>\s*span\s*\{[^}]*padding:\s*0/s);
  assert.match(css, /\.draw-history-row\s*>\s*span\s*\{[^}]*place-items:\s*center/s);
  assert.match(css, /\.draw-history-row \.draw-history-meta:first-child\s*\{[^}]*width:\s*100%[^}]*text-align:\s*center/s);
});

test("歷史開獎表格使用一像素資料分隔線並平均分配彩球", () => {
  assert.match(css, /border-top:\s*1px solid rgba\(111, 82, 39, \.42\)/);
  assert.match(css, /border-left:\s*1px solid rgba\(126, 91, 39, \.24\)/);
  assert.match(css, /\.draw-history-screen \.draw-history-row \.history-numbers\s*\{[^}]*justify-content:\s*space-evenly/s);
  assert.match(css, /\.draw-history-screen \.draw-history-row \.history-main-numbers,[\s\S]*?\.draw-history-screen \.draw-history-row \.history-special-number\s*\{[^}]*display:\s*contents/s);
  assert.doesNotMatch(css, /\.draw-history-screen \.draw-history-row \.history-main-numbers\s*\{[^}]*gap:/s);
});

test("歷史開獎標題列與資料列採指定高度及分隔線", () => {
  assert.match(css, /\.draw-history-head\s*\{[^}]*height:\s*32px[^}]*border-bottom:\s*2px solid rgba\(195, 145, 54, \.64\)/s);
  assert.match(css, /\.draw-history-row\s*\{[^}]*height:\s*54px/s);
  assert.match(css, /\.draw-history-head \+ \.draw-history-row\s*\{[^}]*border-top:\s*0/s);
  assert.match(css, /\.draw-history-week-list\s*\{[^}]*gap:\s*8px/s);
});

test("歷史開獎頁使用12px左右間距、8px標題間距與指定文字尺寸", () => {
  assert.match(css, /\.draw-history-screen \.matrix-title-banner\s*\{[^}]*width:\s*calc\(100% - 24px\)[^}]*margin-bottom:\s*8px/s);
  assert.match(css, /\.draw-history-row \.draw-history-meta:first-child\s*\{[^}]*font-size:\s*14px/s);
  assert.match(css, /\.draw-history-screen \.history-date-stack strong\s*\{[^}]*font-size:\s*14px/s);
  assert.match(css, /\.draw-history-screen \.history-date-stack small\s*\{[^}]*font-size:\s*13px/s);
});

test("彩種下拉移入篩選條件第一項並保留標題列篩選按鈕", () => {
  const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
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
  assert.match(css, /\.draw-history-screen \.history-title-actions \.history-filter-trigger\s*\{[^}]*min-width:\s*68px[^}]*height:\s*26px[^}]*flex:\s*0 0 68px[^}]*font-size:\s*9px/s);
});

test("歷史頁六合彩數字回到彩球中心", () => {
  assert.match(ballCss, /\.draw-history-screen \.draw-history-row \.number-ball-component\.history-lottery-ball:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\)\s*\{[^}]*--number-y:\s*0px/s);
  assert.match(ballCss, /\.draw-history-screen \.draw-history-row \.number-ball-component\.history-lottery-ball\[data-lottery="六合彩"\]\s*\{[^}]*--underline-y:\s*-1\.5px/s);
});

test("歷史頁今彩539與天天樂使用34px彩球及14px數字", () => {
  assert.match(ballCss, /\.draw-history-screen \.draw-history-row \.number-ball-component\.history-lottery-ball:is\(\[data-lottery="今彩539"\], \[data-lottery="天天樂"\]\)\s*\{[^}]*--number-ball-size:\s*34px[^}]*--number-font-size:\s*14px/s);
});

test("歷史頁六合彩與大樂透共用尺寸與數字位置規則", () => {
  assert.match(ballCss, /\.draw-history-screen \.draw-history-row \.number-ball-component\.history-lottery-ball:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\)/);
});

test("六加一維持單列較小彩球且不使用補償位移", () => {
  assert.doesNotMatch(css, /\.draw-history-screen \.draw-history-row \.history-numbers\[data-has-special="true"\] \.history-main-numbers\s*\{[^}]*padding-top:/s);
  assert.doesNotMatch(css, /\.draw-history-screen \.draw-history-week-list\[data-lottery="六合彩"\] \.history-special-label\s*\{[^}]*transform:/s);
  assert.match(css, /\.draw-history-screen \.history-special-ball\s*\{[^}]*height:\s*36px[^}]*grid-template-rows:\s*10px 26px/s);
  assert.match(ballCss, /\.draw-history-screen \.draw-history-row \.number-ball-component\.history-lottery-ball:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\)\s*\{[^}]*--number-ball-size:\s*26px/s);
});
