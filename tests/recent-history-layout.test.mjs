import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const exploreCss = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");
const ballCss = readFileSync(new URL("../src/number-ball.css", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");

test("Matrix Explore 近10期標題列單列顯示排序文字並取消舊固定高度", () => {
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel-title\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel-order\s*\{[^}]*display:\s*inline;[^}]*white-space:\s*nowrap;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel \.panel-heading\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*32px;[^}]*align-items:\s*center;/s);
  assert.match(source, /<SectionTitle>近10期開獎號碼<\/SectionTitle>[\s\S]*?<span className="history-panel-order">（\{numberOrder\}）<\/span>/);
});

test("Matrix Explore 近10期三欄採期數窄日期中等號碼最大寬度", () => {
  assert.match(exploreCss, /grid-template-columns:\s*minmax\(54px, \.9fr\) minmax\(62px, 1\.05fr\) minmax\(0, 3\.25fr\);/);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-row,[\s\S]*?min-height:\s*34px;[\s\S]*?padding:\s*\.0625rem 0;/);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-row > :nth-child\(1\)\s*\{[^}]*white-space:\s*nowrap;/s);
});

test("Matrix Explore 近10期六加一使用主號彈性區與特別號內容寬度且移除 320px 補償規則", () => {
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-main-numbers\s*\{[^}]*flex:\s*1 1 auto;[^}]*flex-wrap:\s*nowrap;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-special-number\s*\{[^}]*flex:\s*0 0 auto;[^}]*white-space:\s*nowrap;/s);
  assert.doesNotMatch(exploreCss, /@media \(max-width:\s*359\.98px\)[\s\S]*?history-special-(?:number|ball|label)/);
  assert.match(source, /className="history-special-number"[\s\S]*?<span aria-hidden="true">\+<\/span>[\s\S]*?className="history-special-label">特別號<\/small>/);
});

test("Matrix Explore 近10期彩球使用 20 至 22px 流體尺寸", () => {
  assert.match(ballCss, /\.matrix-explore-main-screen \.history-panel \.number-ball-component\.history-lottery-ball\s*\{[^}]*--number-ball-size:\s*clamp\(20px, 6vw, 22px\);[^}]*--number-font-size:\s*clamp\(10px, 2\.8vw, 11px\);/s);
});

test("Matrix Explore 近10期正式樣式來源不使用禁止的補償方式", () => {
  const start = exploreCss.indexOf(".matrix-explore-main-screen .history-panel-title");
  const end = exploreCss.indexOf(".matrix-explore-main-screen .repeat-stats-heading");
  const historyLayout = exploreCss.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(historyLayout, /!important|zoom\s*:|scale\(|margin(?:-[a-z]+)?\s*:\s*-|position\s*:\s*absolute/);
});

test("近10期資料列依彩種日期標記跨週分隔線", () => {
  assert.match(source, /data-week-boundary=\{isNearHistoryWeekBoundary\(lottery, previousDate, date\)\}/);
  assert.match(css, /\.history-panel \.history-row\[data-week-boundary="true"\]\s*\{[^}]*border-top:\s*2px solid rgba\(166, 124, 54, \.68\)/s);
});
