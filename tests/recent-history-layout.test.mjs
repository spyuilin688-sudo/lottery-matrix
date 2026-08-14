import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const ballCss = readFileSync(new URL("../src/number-ball.css", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");

test("近10期標題列縮短並加強標題資料分隔線", () => {
  assert.match(css, /\.history-panel \.history-head\s*\{[^}]*min-height:\s*28px[^}]*border-bottom:\s*1px solid rgba\(195, 145, 54, \.70\)/s);
});

test("近10期六加一彩球縮小並維持正碼與特別號同高", () => {
  assert.match(ballCss, /\.history-panel \.history-numbers\[data-has-special="true"\] \.number-ball-component\.history-lottery-ball\[data-lottery="六合彩"\]\s*\{[^}]*--number-ball-size:\s*23\.5px/s);
  assert.match(ballCss, /\.history-panel \.history-numbers\[data-has-special="true"\] \.number-ball-component\.history-lottery-ball\[data-lottery="大樂透"\]\s*\{[^}]*--number-ball-size:\s*23\.5px/s);
  assert.match(css, /\.history-panel \.history-numbers\[data-has-special="true"\] \.history-main-numbers\s*\{[^}]*gap:\s*3px[^}]*padding-top:\s*10px/s);
  assert.match(css, /\.history-panel \.history-numbers\[data-has-special="true"\] \.history-special-ball\s*\{[^}]*height:\s*33\.5px[^}]*grid-template-rows:\s*10px 23\.5px/s);
});

test("近10期資料列依彩種日期標記跨週分隔線", () => {
  assert.match(source, /data-week-boundary=\{isNearHistoryWeekBoundary\(lottery, previousDate, date\)\}/);
  assert.match(css, /\.history-panel \.history-row\[data-week-boundary="true"\]\s*\{[^}]*border-top:\s*2px solid rgba\(166, 124, 54, \.68\)/s);
});
