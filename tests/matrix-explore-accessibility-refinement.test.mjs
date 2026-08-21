import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");
const featureCss = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");

test("探索結果欄位按響應式比例分配，連準次數與版路類型取得較多寬度", () => {
  const columns = css.match(/grid-template-columns:\s*minmax\(0, ([\d.]+)fr\) minmax\(0, ([\d.]+)fr\) minmax\(0, ([\d.]+)fr\) minmax\(0, ([\d.]+)fr\) minmax\(0, ([\d.]+)fr\) minmax\(0, ([\d.]+)fr\)/);
  assert.ok(columns);
  const ratios = columns.slice(1).map(Number);
  assert.ok(ratios[3] > ratios[0] && ratios[3] > ratios[1] && ratios[3] > ratios[2] && ratios[3] > ratios[4]);
  assert.ok(ratios[5] > ratios[0] && ratios[5] > ratios[1] && ratios[5] > ratios[2] && ratios[5] > ratios[4]);
  assert.match(css, /\.road-results-head\s*\{[^}]*font-size:\s*clamp\(10px, 2\.8vw, 12px\)/s);
});

test("探索結果分隔線使用降低亮度的透明色", () => {
  assert.match(css, /\.road-results-head\s*\{[^}]*border-bottom:\s*1px solid rgba\(117, 83, 41, \.45\)/s);
  assert.match(css, /\.road-result-row\s*\{[^}]*border-bottom:\s*1px solid rgba\(90, 87, 80, \.42\)/s);
});

test("重複統計保留指定層級，免責文字恢復原響應式規則", () => {
  assert.match(css, /\.repeat-stats-panel\s*\{[^}]*padding:\s*10px 6px/s);
  assert.match(css, /\.repeat-stats-heading > span\s*\{[^}]*font-size:\s*11px;[^}]*font-weight:\s*400/s);
  assert.match(css, /\.explore-result-disclaimer\s*\{[^}]*color:\s*#aaa49a;[^}]*font-size:\s*clamp\(7px, 2vw, 8px\)/s);
});

test("篩選按鈕維持24px視覺高度並提供至少44px點擊範圍", () => {
  assert.match(css, /\.consecutive-filter-button,[\s\S]*?\.repeat-stats-heading button\s*\{[^}]*height:\s*24px/s);
  assert.match(featureCss, /\.consecutive-filter-button::before,[\s\S]*?\.repeat-stats-heading button::before\s*\{[^}]*width:\s*max\(100%, 44px\);[^}]*height:\s*44px;/s);
});

test("推薦與 Matrix Pro 恢復共用自動高度及膠囊圓角", () => {
  assert.match(css, /\.segmented button em\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*0;[^}]*border-radius:\s*9999px/s);
});

test("探索正式樣式不以重複規則覆寫表頭字級與近10期列高", () => {
  const sharedResultRule = css.match(/\.road-results-head,[\s\S]*?\.road-result-row\s*\{([^}]*)\}/s);
  assert.ok(sharedResultRule);
  assert.doesNotMatch(sharedResultRule[1], /font-size\s*:/);
  assert.match(css, /\.road-result-row\s*\{[^}]*font-size:\s*\.6875rem/s);

  const sharedHistoryRule = css.match(/\.history-row\s*\{([^}]*)\}/s);
  assert.ok(sharedHistoryRule);
  assert.doesNotMatch(sharedHistoryRule[1], /(?:min-)?height\s*:/);
  assert.doesNotMatch(css, /\.history-row,\s*\n\.matrix-explore-main-screen \.history-row\.history-head/);
});
