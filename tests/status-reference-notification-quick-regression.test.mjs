import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const feature = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const adjustments = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");
const responsive = readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");
const referenceVisual = readFileSync(new URL("../src/number-reference-visual-refinement.css", import.meta.url), "utf8");
const pages = readFeaturePagesSource();
const core = readFileSync(new URL("../src/FeaturePagesCore.tsx", import.meta.url), "utf8");
const prototype = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");
const notifications = readFileSync(new URL("../src/NotificationsPagePatched.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const lotterySwitcher = readFileSync(new URL("../src/homepage/lottery-switcher.css", import.meta.url), "utf8");

test("Matrix 狀態兩頁的彩種切換器只由頁面內距控制左右外距", () => {
  assert.match(feature, /:is\(\.matrix-status-screen, \.matrix-custom-status-screen\) \.matrix-status-lottery-switcher\s*\{[^}]*width:\s*100%;[^}]*margin:\s*0 0 8px;/s);
});

test("彩種按鈕的選取範圍跟隨共用切角外框", () => {
  assert.match(lotterySwitcher, /--matrix-option-cut:\s*clamp\(4px, 1\.54vw, 6px\);/);
  assert.match(lotterySwitcher, /\.lottery-card\s*\{[^}]*clip-path:\s*polygon\(/s);
  assert.match(lotterySwitcher, /\.lottery-card::after\s*\{[^}]*clip-path:\s*inherit;[^}]*border-radius:\s*0;[^}]*background:\s*var\(--home-octagon-frame\);/s);
});

test("自訂觸發四狀態與上方彩種切換同步長寬高間距及切角", () => {
  assert.match(lotterySwitcher, /\.matrix-custom-status-screen \.custom-status-tabs\s*\{[^}]*width:\s*100%;[^}]*aspect-ratio:\s*1532 \/ 214;[^}]*padding-block:\s*0;[^}]*padding-inline:\s*4px;[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[^}]*gap:\s*6px;/s);
  assert.match(lotterySwitcher, /\.lottery-card,[\s\S]*?\.custom-status-tabs > button\s*\{[^}]*height:\s*100%;[^}]*clip-path:\s*polygon\(/s);
  assert.match(lotterySwitcher, /\.custom-status-tabs > button::after\s*\{[^}]*background:\s*var\(--home-octagon-frame\);/s);
  assert.doesNotMatch(feature, /\.custom-status-tabs\s*\{[^}]*padding-inline:\s*4px;/s);
  assert.doesNotMatch(feature, /\.custom-status-tabs button\s*\{[^}]*border-radius:\s*8px;/s);
});

test("Matrix 狀態設定入口只由底部導覽位置承載", () => {
  assert.doesNotMatch(feature, /status-title-trigger/);
  assert.doesNotMatch(adjustments, /status-title-trigger/);
  assert.match(pages, /className="bottom-navigation-quick-settings matrix-status-settings-entry"/);
});

test("Matrix 同星底部在導覽清除距離外再保留 8px", () => {
  assert.match(responsive, /\.tongxing-screen \.feature-body\s*\{[^}]*padding:\s*0 var\(--tool-page-inline\) calc\(var\(--layout-bottom-nav-clearance\) \+ 8px\);/s);
});

test("號碼對照單輸入數字字型與 Matrix 同星一致", () => {
  assert.match(feature, /\.reference-search input\s*\{[^}]*font-size:\s*clamp\(15px, 4\.5vw, 18px\);[^}]*font-weight:\s*600;[^}]*font-variant-numeric:\s*tabular-nums;/s);
});

test("號碼對照單單碼與整列選取彼此獨立，特別號也保留選取樣式", () => {
  const cellHandler = pages.slice(pages.indexOf("const toggleMarkedCell"), pages.indexOf("const startReferenceSearch"));
  assert.match(cellHandler, /setMarkedCells/);
  assert.doesNotMatch(cellHandler, /setMarkedRows/);
  assert.match(referenceVisual, /button\[data-special="true"\]\[data-cell-marked="true"\]\s*\{[^}]*background:\s*rgba\(224, 124, 24, \.68\)/s);
  assert.match(referenceVisual, /data-row-marked="true"[^\{]*button\[data-special="true"\]\s*\{[^}]*background:\s*rgba\(225, 184, 39, \.16\)/s);
});

test("號碼對照單期數與開獎號碼分隔線使用清楚一致的色值", () => {
  assert.match(referenceVisual, /\.reference-row > \.reference-issue \+ span\s*\{[^}]*border-left:\s*1px solid rgba\(161, 112, 40, \.78\);/s);
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
