import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homeCss = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");
const featureCss = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const adjustmentCss = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");
const guideSource = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const prototypeSource = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");
const notificationsSource = readFileSync(new URL("../src/NotificationsPagePatched.tsx", import.meta.url), "utf8");

test("首頁 Matrix Core 與五大功能維持上下 8px 節奏", () => {
  assert.match(homeCss, /\.home-screen \.home-layout\s*\{[^}]*row-gap:\s*8px;/s);
  assert.match(homeCss, /\.home-bottom-group\s*\{[^}]*--home-gap-core-features:\s*8px;[^}]*padding-bottom:\s*8px;/s);
});

test("通知選號提醒時間控制項為 23px 且兩列相距 6px", () => {
  assert.match(adjustmentCss, /\.notifications-screen-v2 \.notification-time-select\s*\{[^}]*height:\s*23px;[^}]*min-height:\s*23px;/s);
  assert.match(adjustmentCss, /\.notification-bet-grid \.notification-grid-time-row \+ \.notification-grid-time-row\s*\{[^}]*margin-block-start:\s*2px;/s);
});

test("開獎結果與 Matrix 牌單共用同一選項渲染器與樣式", () => {
  assert.match(notificationsSource, /return renderGenericSettings\(key, title, subtitle\);/);
  assert.doesNotMatch(adjustmentCss, /data-setting-key=["']?(?:result|card)/);
});

test("號碼對照單固定與浮動設定共用 26px 控制高度", () => {
  assert.match(featureCss, /\.reference-query-panel\s*\{[^}]*--reference-control-height:\s*26px;/s);
  assert.match(featureCss, /\.reference-query-panel \.reference-search input,\s*\.reference-query-panel \.reference-search \.gold-button\s*\{[^}]*height:\s*var\(--reference-control-height\);/s);
});

test("我的頁面在底部導覽淨空之外保留 8px", () => {
  assert.match(featureCss, /\.profile-screen \.feature-body\s*\{[^}]*padding-bottom:\s*calc\(var\(--layout-bottom-nav-clearance\) \+ 8px\);/s);
});

test("快捷設定不依賴一次性 portal host 才能顯示", () => {
  assert.doesNotMatch(prototypeSource, /quickSettingsHost/);
  assert.doesNotMatch(prototypeSource, /createPortal/);
  assert.match(prototypeSource, /const quickSettings = quickSettingsOpen\s*\?/);
  assert.doesNotMatch(featureCss, /\.quick-settings-backdrop\s*\{/);
});

test("指南複製卡片可透過事件委派選取且修正延遲較溫和", () => {
  assert.match(guideSource, /const GUIDE_LOOP_IDLE_MS = 200;/);
  assert.match(guideSource, /data-guide-index=\{index\}/);
  assert.match(guideSource, /closest<HTMLElement>\("\[data-guide-index\]"\)/);
  assert.match(guideSource, /onClick=\{selectGuideCategory\}/);
});

test("指南章節編號等寬且說明標號縮短", () => {
  assert.match(adjustmentCss, /\.guide-category-card > span\s*\{[^}]*font-family:\s*ui-monospace,/s);
  assert.match(adjustmentCss, /font-variant-numeric:\s*tabular-nums;/);
  assert.match(featureCss, /\.guide-preview header > span\s*\{[^}]*width:\s*33px;[^}]*height:\s*26\.4px;/s);
});
