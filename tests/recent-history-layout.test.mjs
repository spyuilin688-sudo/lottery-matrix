import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const exploreCss = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");
const ballCss = readFileSync(new URL("../src/number-ball.css", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");

test("Matrix Explore 近10期標題整合收合箭頭並可隱藏排序文字", () => {
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel-title\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel-order\s*\{[^}]*display:\s*inline;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel \.panel-heading\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*32px;[^}]*align-items:\s*center;/s);
  assert.match(source, /showOrderText \? <span className="history-panel-order">（\{numberOrder\}）<\/span> : null/);
});

test("Matrix Explore 近10期標題收合按鍵保留狀態標籤", () => {
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel-title\s*\{[^}]*min-width:\s*0;[^}]*flex:\s*1 1 auto;[^}]*overflow:\s*hidden;/s);
  assert.match(source, /className="history-panel-toggle"[\s\S]*?aria-label=\{expanded \? "收合近10期開獎號碼" : "展開近10期開獎號碼"\}/);
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
  assert.match(ballCss, /\.matrix-explore-main-screen \.history-panel:is\(\[data-lottery="今彩539"\], \[data-lottery="天天樂"\]\) \.number-ball-component\.history-lottery-ball\s*\{[^}]*--number-ball-size:\s*clamp\(24px, 7\.18vw, 28px\);[^}]*--number-font-size:\s*clamp\(12px, 3\.59vw, 14px\);[^}]*--underline-width:\s*clamp\(9px, 2\.82vw, 11px\);[^}]*--underline-height:\s*\.7px;[^}]*--underline-y:\s*\.2px;/s);
  assert.match(ballCss, /\.matrix-explore-main-screen \.history-panel\[data-lottery="六合彩"\] \.number-ball-component\.history-lottery-ball\s*\{[^}]*--number-ball-size:\s*var\(--matrix-history-ball-size\);[^}]*--number-font-size:\s*clamp\(7px, 2\.31vw, 9px\);[^}]*--underline-width:\s*clamp\(7px, 2\.31vw, 9px\);[^}]*--underline-height:\s*\.7px;[^}]*--underline-y:\s*-1px;[^}]*transform:\s*translateY\(2px\);/s);
  assert.match(ballCss, /\.matrix-explore-main-screen \.history-panel\[data-lottery="大樂透"\] \.number-ball-component\.history-lottery-ball\s*\{[^}]*--number-font-size:\s*clamp\(9px, 2\.82vw, 11px\);[^}]*--underline-height:\s*\.7px;[^}]*--underline-y:\s*\.3px;[^}]*transform:\s*translateY\(3px\);/s);
});

test("Matrix Explore 六加一使用 40px 列高與各自彩球尺寸", () => {
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel\[data-lottery="六合彩"\]\s*\{[^}]*--matrix-history-ball-size:\s*clamp\(18px, 5\.64vw, 22px\);/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel\[data-lottery="大樂透"\]\s*\{[^}]*--matrix-history-ball-size:\s*clamp\(20px, 6\.15vw, 24px\);/s);
  assert.match(exploreCss, /data-lottery="六合彩"[^}]*data-lottery="大樂透"[^}]*\.history-row:not\(\.history-head\)\s*\{[^}]*height:\s*40px;[^}]*min-height:\s*40px/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\) \.history-special-ball\s*\{[^}]*row-gap:\s*2px;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\) \.history-special-label\s*\{[^}]*display:\s*block;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel\[data-lottery="六合彩"\] \.history-special-ball\s*\{[^}]*position:\s*relative;[^}]*height:\s*40px;[^}]*grid-template-rows:\s*1fr;[^}]*row-gap:\s*0;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-panel\[data-lottery="六合彩"\] \.history-special-label\s*\{[^}]*position:\s*absolute;/s);
});

test("Matrix Explore 近10期正式樣式來源不使用禁止的補償方式", () => {
  const start = exploreCss.indexOf(".matrix-explore-main-screen .history-panel-title");
  const end = exploreCss.indexOf(".matrix-explore-main-screen .repeat-stats-heading");
  const historyLayout = exploreCss.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(historyLayout, /!important|zoom\s*:|scale\(|margin(?:-[a-z]+)?\s*:\s*-/);
  assert.equal((historyLayout.match(/position:\s*absolute/g) ?? []).length, 2);
  assert.match(historyLayout, /data-lottery="六合彩"[^}]*\.history-special-label\s*\{[^}]*position:\s*absolute/s);
  assert.match(historyLayout, /data-lottery="大樂透"[^}]*\.history-special-label\s*\{[^}]*position:\s*absolute/s);
});

test("近10期資料列依彩種日期標記跨週分隔線", () => {
  assert.match(source, /data-week-boundary=\{isNearHistoryWeekBoundary\(lottery, previousDate, date\)\}/);
  assert.match(css, /\.history-panel \.history-row\[data-week-boundary="true"\]\s*\{[^}]*border-top:\s*2px solid rgba\(166, 124, 54, \.68\)/s);
});
