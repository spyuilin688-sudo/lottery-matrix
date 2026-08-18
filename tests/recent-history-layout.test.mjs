import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const exploreCss = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");
const ballCss = readFileSync(new URL("../src/number-ball.css", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");

test("近10期標題列縮短並加強標題資料分隔線", () => {
  assert.match(css, /\.history-panel \.history-head\s*\{[^}]*min-height:\s*28px[^}]*border-bottom:\s*1px solid rgba\(195, 145, 54, \.70\)/s);
});

test("Matrix Explore 近10期彩球採流體尺寸且 320px 六加一保持單列", () => {
  assert.match(ballCss, /\.matrix-explore-main-screen \.history-panel \.number-ball-component\.history-lottery-ball\s*\{[^}]*--number-ball-size:\s*clamp\(20px, 6vw, 28px\);[^}]*--number-font-size:\s*clamp\(10px, 2\.8vw, 12px\);/s);
  assert.match(exploreCss, /@media \(max-width:\s*359\.98px\)[\s\S]*?grid-template-columns:\s*2\.5fr 2\.5fr 7fr;/s);
  assert.match(exploreCss, /@media \(max-width:\s*359\.98px\)[\s\S]*?\.history-special-number\s*\{[^}]*gap:\s*0;[\s\S]*?\.history-special-ball\s*\{[^}]*width:\s*clamp\(20px, 6vw, 28px\)/s);
});

test("近10期資料列依彩種日期標記跨週分隔線", () => {
  assert.match(source, /data-week-boundary=\{isNearHistoryWeekBoundary\(lottery, previousDate, date\)\}/);
  assert.match(css, /\.history-panel \.history-row\[data-week-boundary="true"\]\s*\{[^}]*border-top:\s*2px solid rgba\(166, 124, 54, \.68\)/s);
});
