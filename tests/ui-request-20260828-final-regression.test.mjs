import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const reference = read("src/number-reference-visual-refinement.css");
const tongxing = read("src/tongxing-compact.css");
const feature = read("src/feature-pages.css");
const exploreSpacing = read("src/matrix-explore-spacing.css");
const prototype = read("src/prototype.css");
const prototypeView = read("src/Prototype.tsx");
const base = read("src/homepage/base.css");
const switcher = read("src/homepage/lottery-switcher.css");
const visual = read("src/homepage/visual-language.css");
const pages = readFeaturePagesSource();

test("號碼對照單只使用一條 1px 的期數與開獎號碼分隔線", () => {
  assert.match(reference, /\.reference-row > \.reference-issue \+ span\s*\{[^}]*border-left:\s*1px solid rgba\(161, 112, 40, \.78\);/s);
  assert.doesNotMatch(reference, /\.reference-row > span \+ span,[\s\S]*?border-left:\s*2px/s);
});

test("Matrix 同星開始探索高度上下各縮減 2px", () => {
  assert.match(tongxing, /--primary-button-height:\s*36px;/);
});

test("Matrix 天工所有設定列共用同一個響應式標籤欄與選項欄", () => {
  assert.match(feature, /\.matrix-tiangong-screen \.tiangong-settings\s*\{[^}]*--tiangong-label-column:\s*clamp\(130px, 35vw, 136px\);/s);
  assert.match(feature, /\.matrix-tiangong-screen \.tiangong-settings \.setting-grid > label,[\s\S]*?\.tiangong-setting-row\s*\{[^}]*grid-template-columns:\s*var\(--tiangong-label-column\) minmax\(0, 1fr\);/s);
  assert.match(feature, /\.tiangong-setting-row \.segmented\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/s);
});

test("首頁快捷設定由左下角向右與向上各移動 4px，指南文案同步", () => {
  assert.match(prototype, /\.bottom-navigation-quick-settings\s*\{[^}]*left:\s*max\(10px, calc\(env\(safe-area-inset-left, 0px\) \+ 4px\)\);[^}]*right:\s*auto;[^}]*bottom:\s*calc\(var\(--bottom-nav-safe-area\) \+ 9px\);/s);
  assert.match(pages, /左下角設定按鈕/);
});

test("首頁狀態圖示與探索滑動圖示使用指定位置尺寸", () => {
  assert.match(base, /\.home-screen \.matrix-status-lottery-logo\s*\{[^}]*left:\s*calc\(83\.5% - 24px\);/s);
  assert.match(feature, /\.matrix-explore-screen \.matrix-title-banner-actions\s*\{[^}]*left:\s*calc\(83% \+ 3px\);[^}]*width:\s*2\.34rem;[^}]*height:\s*2\.34rem;/s);
  assert.doesNotMatch(feature, /status-title-trigger/);
  assert.match(pages, /matrix-status-settings-entry/);
  assert.doesNotMatch(exploreSpacing, /\.matrix-explore-main-screen \.matrix-title-banner-actions\s*\{/);
});

test("查看更多紀錄間距為 2px", () => {
  assert.match(base, /\.home-screen \.latest-draw-card \.history-link\s*\{[^}]*gap:\s*2px;/s);
});

test("首頁、Matrix 狀態與自訂頁的彩種選取框只由共用切換器樣式管理", () => {
  assert.match(switcher, /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card::after\s*\{[^}]*background:\s*var\(--home-octagon-frame\);/s);
  assert.match(switcher, /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{[^}]*--home-frame-color:\s*var\(--lottery-gold-300\);/s);
  assert.match(visual, /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card,[\s\S]*?--home-octagon-frame:/s);
  assert.doesNotMatch(visual.match(/:is\(\.home-screen,[\s\S]*?\n\}/)?.[0] ?? "", /--home-octagon-frame:/);
  assert.doesNotMatch(base, /lottery-card\[data-selected="true"\]::after/);
  assert.doesNotMatch(visual, /lottery-card\[data-selected="true"\]::after/);
  assert.match(pages, /className="lottery-switcher--home-style matrix-status-lottery-switcher"/);
});

test("首頁 Matrix Core M 與圓環貼合原圖並保留外框環流與八節點", () => {
  assert.match(prototypeView, /className="matrix-core-symbol-energy"/);
  assert.match(prototypeView, /className="matrix-core-energy-path matrix-core-energy-path--m" d="M1099 340V111H1129L1163 222L1197 111H1226V340"/);
  assert.match(prototypeView, /className="matrix-core-energy-path matrix-core-energy-path--ring" cx="1163" cy="207" rx="212" ry="144"/);
  assert.match(prototypeView, /className="matrix-core-energy-loop"/);
  assert.equal((prototypeView.match(/className="matrix-core-node"/g) ?? []).length, 8);
  assert.match(visual, /\.matrix-core-energy-path\s*\{[^}]*stroke-dasharray:\s*5 95;[^}]*animation:\s*matrix-core-symbol-circulation/s);
  assert.match(visual, /@keyframes matrix-core-energy-circulation/);
  assert.match(visual, /@keyframes matrix-core-node-pulse/);
  assert.doesNotMatch(base, /matrix-core-stardust-scan/);
  assert.doesNotMatch(base, /matrix-core-pulse/);
});
