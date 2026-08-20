import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const exploreCss = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");
const ballCss = readFileSync(new URL("../src/number-ball.css", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");

test("Matrix Explore 近10期標題列單列顯示排序文字並取消舊固定高度", () => {
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel-title\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel-order\s*\{[^}]*display:\s*inline;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel \.panel-heading\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*32px;[^}]*align-items:\s*center;/s);
  assert.match(source, /<SectionTitle>近10期開獎號碼<\/SectionTitle>[\s\S]*?<span className="history-panel-order">（\{numberOrder\}）<\/span>/);
});

test("Matrix Explore 近10期收合按鍵保留可點擊面積且不擠壓標題", () => {
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel-title\s*\{[^}]*min-width:\s*0;[^}]*flex:\s*1 1 auto;[^}]*overflow:\s*hidden;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel-actions > \.history-panel-collapse-button\s*\{[^}]*min-width:\s*24px;[^}]*min-height:\s*24px;[^}]*padding:\s*0;[^}]*place-items:\s*center;/s);
});

test("Matrix Explore 近10期三欄採期數窄日期中等號碼最大寬度", () => {
  assert.match(exploreCss, /grid-template-columns:\s*minmax\(0, \.65fr\) minmax\(0, \.85fr\) minmax\(0, 3\.5fr\);/);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-row,[\s\S]*?height:\s*40px;[\s\S]*?min-height:\s*40px;[\s\S]*?padding:\s*0;/);
  assert.doesNotMatch(css, /--mx-history-issue-size:/);
  assert.match(exploreCss, /--mx-history-issue-size:\s*clamp\(6px, 2\.1vw, 8px\);/);
  const issueRule = exploreCss.match(/\.matrix-explore-main-screen \.history-row:not\(\.history-head\) > :nth-child\(1\)\s*\{([^}]*)\}/s);
  assert.ok(issueRule);
  assert.match(issueRule[1], /color:\s*#fff;[\s\S]*font-family:\s*inherit;[\s\S]*font-weight:\s*800;[\s\S]*white-space:\s*nowrap;/);
  assert.doesNotMatch(issueRule[1], /font-size\s*:/);
});

test("Matrix Explore 近10期三欄標題字級一致且直向分隔線清楚", () => {
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-row\.history-head > span\s*\{[^}]*font-size:\s*inherit;[^}]*font-weight:\s*inherit;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-row > :nth-child\(1\),[\s\S]*?\.matrix-explore-main-screen \.history-row > :nth-child\(2\)\s*\{[^}]*border-right:\s*1px solid rgba\(126, 91, 39, \.9\);/s);
});

test("Matrix Explore 近10期六加一使用連續內容寬度群組且移除 320px 補償規則", () => {
  const narrowMediaStart = exploreCss.indexOf("@media (max-width: 359.98px)");
  const wideMediaStart = exploreCss.indexOf("@media (min-width: 40rem)");
  const narrowMedia = exploreCss.slice(narrowMediaStart, wideMediaStart);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-main-numbers\s*\{[^}]*flex:\s*0 0 auto;[^}]*flex-wrap:\s*nowrap;[^}]*gap:\s*clamp\(4px, 1\.8vw, 8px\);/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-special-number\s*\{[^}]*flex:\s*0 0 auto;[^}]*white-space:\s*nowrap;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\) \.history-main-numbers\s*\{[^}]*gap:\s*clamp\(4px, 1\.5vw, 7px\);/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\) \.history-special-number\s*\{[^}]*margin-left:\s*0;[^}]*gap:\s*clamp\(4px, 1\.5vw, 7px\);/s);
  assert.ok(narrowMediaStart >= 0 && wideMediaStart > narrowMediaStart);
  assert.doesNotMatch(narrowMedia, /history-special-(?:number|ball|label)/);
  assert.match(source, /className="history-special-number"[\s\S]*?<span aria-hidden="true">\+<\/span>[\s\S]*?className="history-special-label">特別號<\/small>/);
});

test("Matrix Explore 近10期五顆彩球放大，六加一彩球響應式縮放", () => {
  assert.match(ballCss, /\.matrix-explore-main-screen \.history-panel \.number-ball-component\.history-lottery-ball\s*\{[^}]*--number-ball-size:\s*clamp\(20px, 6vw, 22px\);[^}]*--number-font-size:\s*clamp\(10px, 2\.8vw, 11px\);/s);
  assert.match(ballCss, /\.matrix-explore-main-screen \.history-panel:is\(\[data-lottery="今彩539"\], \[data-lottery="天天樂"\]\) \.number-ball-component\.history-lottery-ball\s*\{[^}]*--number-ball-size:\s*clamp\(24px, 7\.18vw, 28px\);[^}]*--number-font-size:\s*clamp\(10px, 3\.08vw, 12px\);[^}]*--underline-width:\s*clamp\(9px, 2\.82vw, 11px\);[^}]*--underline-height:\s*\.5px;[^}]*--underline-y:\s*\.5px;/s);
  assert.match(ballCss, /\.matrix-explore-main-screen \.history-panel:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\) \.number-ball-component\.history-lottery-ball\s*\{[^}]*--number-ball-size:\s*var\(--matrix-history-ball-size\);[^}]*--number-font-size:\s*clamp\(9px, 2\.82vw, 11px\);[^}]*--underline-height:\s*\.5px;[^}]*--underline-y:\s*\.5px;/s);
});

test("Matrix Explore 六加一維持統一列高並在特別號球上方保留間距", () => {
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\)\s*\{[^}]*--matrix-history-ball-size:\s*clamp\(20px, 6\.15vw, 24px\);/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-row,[\s\S]*?height:\s*40px;[^}]*min-height:\s*40px;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\) \.history-special-ball\s*\{[^}]*row-gap:\s*2px;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\) \.history-special-label\s*\{[^}]*display:\s*block;/s);
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
