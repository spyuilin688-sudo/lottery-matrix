import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const feature = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const adjustments = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");
const responsive = readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");
const referenceVisual = readFileSync(new URL("../src/number-reference-visual-refinement.css", import.meta.url), "utf8");
const pages = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const core = readFileSync(new URL("../src/FeaturePagesCore.tsx", import.meta.url), "utf8");
const prototype = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");
const notifications = readFileSync(new URL("../src/NotificationsPagePatched.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");

test("Matrix 狀態兩頁的彩種切換器只由頁面內距控制左右外距", () => {
  assert.match(feature, /:is\(\.matrix-status-screen, \.matrix-custom-status-screen\) \.matrix-status-lottery-switcher\s*\{[^}]*width:\s*100%;[^}]*margin:\s*0 0 8px;/s);
});

test("Matrix 狀態標題圖示不再被最終覆寫壓暗", () => {
  const finalRule = adjustments.match(/\.matrix-status-screen \.status-title-trigger img\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.doesNotMatch(finalRule, /opacity|filter/);
  assert.match(feature, /\.matrix-status-screen \.status-title-trigger img\s*\{[^}]*opacity:\s*\.8;/s);
});

test("Matrix 同星底部在導覽清除距離外再保留 8px", () => {
  assert.match(responsive, /\.tongxing-screen \.feature-body\s*\{[^}]*padding:\s*0 var\(--tool-page-inline\) calc\(var\(--layout-bottom-nav-clearance\) \+ 8px\);/s);
});

test("號碼對照單輸入數字字型與 Matrix 同星一致", () => {
  assert.match(feature, /\.reference-search input\s*\{[^}]*font-size:\s*clamp\(15px, 4\.5vw, 18px\);[^}]*font-weight:\s*600;[^}]*font-variant-numeric:\s*tabular-nums;/s);
});

test("號碼對照單單碼覆蓋儲存格但保留整列選取，特別號也保留選取樣式", () => {
  const toggleMarkedCell = pages.match(/const toggleMarkedCell = \(issue: string, number: string\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
  assert.doesNotMatch(toggleMarkedCell, /setMarkedRows/);
  assert.match(toggleMarkedCell, /setMarkedCells/);
  assert.match(referenceVisual, /button\[data-special="true"\]\[data-cell-marked="true"\]\s*\{[^}]*background:\s*rgba\(224, 124, 24, \.68\)/s);
  assert.match(referenceVisual, /data-row-marked="true"[^\{]*button\[data-special="true"\]\s*\{[^}]*background:\s*rgba\(225, 184, 39, \.16\)/s);
});

test("號碼對照單期數與開獎號碼分隔線使用清楚一致的色值", () => {
  assert.match(referenceVisual, /\.reference-row > span \+ span,[\s\S]*?\.reference-row > \.reference-issue \+ span\s*\{[^}]*border-left:\s*1px solid rgba\(161, 112, 40, \.78\);/s);
});

test("開獎結果與 Matrix 牌單共用同一按鈕渲染器與 6px 外框內距", () => {
  assert.match(notifications, /\["result", "開獎結果", "今彩539、天天樂、六合彩、大樂透"/);
  assert.match(notifications, /\["card", "Matrix 牌單", "今彩539、天天樂、六合彩、大樂透"/);
  assert.match(notifications, /return renderGenericSettings\(key, title, subtitle\)/);
  assert.match(adjustments, /notification-inline-option-row:is\([\s\S]*?data-setting-key="result"[\s\S]*?data-setting-key="card"[\s\S]*?\)\s*\{[^}]*padding-inline:\s*6px;/s);
});

test("快捷頁首返回使用開啟前介面，底部首頁仍維持一般導覽", () => {
  assert.match(pages, /onQuickBack\?:\s*\(\) => void/);
  assert.match(core, /quickActive && onQuickBack \? onQuickBack\(\) : onNavigate\(backTarget\)/);
  assert.match(prototype, /onQuickBack=\{closeQuick\}/);
});

test("首頁只有正式首頁樣式表擁有首頁版面規則", () => {
  assert.match(main, /"\.\/homepage-repair\.css"/);
  assert.doesNotMatch(main, /homepage-debug\.css/);
  for (const css of [adjustments, responsive]) {
    assert.doesNotMatch(css, /\.home-screen\s+\.(?:lottery-screen|latest-draw-card|matrix-status-section|home-bottom-group|home-shortcut-row)/);
  }
});
