import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const ballCss = readFileSync(new URL("../src/number-ball.css", import.meta.url), "utf8");

test("歷史開獎三欄使用單一正式比例並將前兩欄內容幾何置中", () => {
  assert.match(css, /\.draw-history-row\s*\{[^}]*grid-template-columns:\s*56px 60px minmax\(0, 1fr\)/s);
  assert.match(css, /\.draw-history-row\s*>\s*span\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.draw-history-row\s*>\s*span\s*\{[^}]*padding:\s*0/s);
  assert.match(css, /\.draw-history-row\s*>\s*span\s*\{[^}]*place-items:\s*center/s);
  assert.match(css, /\.draw-history-row \.draw-history-meta:first-child\s*\{[^}]*width:\s*100%[^}]*text-align:\s*center/s);
});

test("歷史開獎表格降低分隔線亮度並分開五球與六加一排列", () => {
  assert.match(css, /border-top:\s*1px solid rgba\(111, 82, 39, \.22\)/);
  assert.match(css, /border-left:\s*1px solid rgba\(126, 91, 39, \.24\)/);
  assert.match(css, /\.draw-history-row \.history-numbers:not\(\[data-has-special="true"\]\)[^}]*justify-content:\s*center/s);
  assert.match(css, /\.draw-history-row \.history-numbers\[data-has-special="true"\] \.history-main-numbers[^}]*gap:\s*3px/s);
});

test("歷史開獎標題列與資料列採緊湊高度並加強標題區隔", () => {
  assert.match(css, /\.draw-history-head\s*\{[^}]*min-height:\s*34px[^}]*border-bottom:\s*1px solid rgba\(195, 145, 54, \.64\)/s);
  assert.match(css, /\.draw-history-row\s*\{[^}]*min-height:\s*50px/s);
  assert.match(css, /\.draw-history-week-list\s*\{[^}]*gap:\s*8px/s);
});

test("標題卡控制項固定在右側並保留完整彩種文字寬度", () => {
  assert.match(css, /\.history-title-lottery\s*\{[^}]*width:\s*84px/s);
  assert.match(css, /\.draw-history-screen \.matrix-title-banner-actions\s*\{[^}]*right:\s*3%[^}]*left:\s*auto[^}]*width:\s*48%[^}]*height:\s*auto/s);
  assert.match(css, /\.draw-history-screen \.history-title-lottery\.native-select select\s*\{[^}]*padding:\s*0 16px 0 6px/s);
});

test("歷史頁六合彩數字回到彩球中心", () => {
  assert.match(ballCss, /\.draw-history-screen \.draw-history-row \.number-ball-component\.history-lottery-ball\[data-lottery="六合彩"\]\s*\{[^}]*--number-y:\s*0px/s);
});

test("六加一正碼增加球距並將數字底線間距設為0.3px", () => {
  assert.match(css, /\.draw-history-screen \.draw-history-row \.history-numbers\[data-has-special="true"\] \.history-main-numbers\s*\{[^}]*gap:\s*3px/s);
  assert.match(ballCss, /\.draw-history-screen \.draw-history-row \.number-ball-component\.history-lottery-ball:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\)\s*\{[^}]*--underline-y:\s*\.3px/s);
});
