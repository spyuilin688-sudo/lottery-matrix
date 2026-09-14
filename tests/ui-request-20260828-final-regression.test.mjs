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
const logoSpacing = read("src/homepage/logo-spacing.css");
const pages = readFeaturePagesSource();

test("號碼對照單只使用一條 1px 的期數與開獎號碼分隔線", () => {
  assert.match(reference, /\.reference-row > \.reference-issue \+ span\s*\{[^}]*border-left:\s*1px solid rgba\(161, 112, 40, \.78\);/s);
  assert.doesNotMatch(reference, /\.reference-row > span \+ span,[\s\S]*?border-left:\s*2px/s);
});

test("Matrix 同星開始探索高度上下各縮減 2px", () => {
  assert.match(tongxing, /--primary-button-height:\s*36px;/);
});

test("Matrix 天工所有設定列共用同一個響應式標籤欄與選項欄", () => {
  assert.match(exploreSpacing, /\.matrix-tiangong-screen \.tiangong-settings\s*\{[^}]*--tiangong-label-column:\s*88\.8px;/s);
  assert.match(feature, /\.matrix-tiangong-screen \.tiangong-settings \.setting-grid > label,[\s\S]*?\.matrix-tiangong-screen \.tiangong-settings \.tiangong-setting-row\s*\{[^}]*grid-template-columns:\s*var\(--tiangong-label-column\) minmax\(0, 1fr\);/s);
  assert.match(exploreSpacing, /@media \(min-width:\s*40rem\)[\s\S]*?\.matrix-tiangong-screen \.tiangong-settings\s*\{[^}]*--tiangong-label-column:\s*104\.8px;/s);
});

test("首頁快捷設定位於 Logo 卡右上角且指南文案同步", () => {
  assert.match(logoSpacing, /\.home-screen \.home-brand-frame > \.header-settings-button\s*\{[^}]*position:\s*absolute;[^}]*top:\s*0;[^}]*right:\s*0;/s);
  assert.doesNotMatch(prototype, /\.bottom-navigation-quick-settings\s*\{/);
  assert.match(pages, /Logo 卡右上角設定按鈕/);
});

test("首頁狀態圖示維持位置，探索切換圖示移至設定標題同列", () => {
  assert.match(base, /\.home-screen \.matrix-status-lottery-logo\s*\{[^}]*left:\s*calc\(83\.5% - 24px\);/s);
  assert.match(feature, /\.matrix-settings-heading\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*space-between;/s);
  assert.doesNotMatch(feature, /status-title-trigger/);
  assert.match(pages, /className="header-settings-button"[^>]*aria-label="自訂觸發條件，連續點擊兩下開啟"/s);
  assert.doesNotMatch(pages, /matrix-status-settings-entry/);
  assert.doesNotMatch(exploreSpacing, /\.matrix-explore-main-screen \.matrix-title-banner-actions\s*\{/);
});

test("查看更多紀錄間距為 2px", () => {
  assert.match(base, /\.home-screen \.latest-draw-card \.history-link\s*\{[^}]*gap:\s*2px;/s);
});

test("首頁、Matrix 狀態與自訂頁的彩種選取框只由共用切換器樣式管理", () => {
  assert.match(switcher, /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\s*\{[^}]*border:\s*1px solid var\(--home-frame-muted\);[^}]*border-radius:\s*var\(--home-frame-radius\);[^}]*background-color:\s*rgba\(0, 0, 0, \.4\);/s);
  assert.match(switcher, /\.lottery-card\[data-selected="true"\]\s*\{[^}]*background-color:\s*transparent;/s);
  assert.doesNotMatch(`${switcher}\n${visual}`, /\.lottery-card::(?:before|after)\s*\{|--home-octagon-frame/);
  assert.match(pages, /className="lottery-switcher--home-style matrix-status-lottery-switcher"/);
});

test("首頁 Matrix Core 由單一正式圖稿與亮金圓角框呈現", () => {
  assert.match(prototypeView, /className="matrix-core-banner home-core-box"/);
  assert.match(prototypeView, /className="matrix-core-description"/);
  assert.match(base, /\.home-screen \.matrix-core-banner\s*\{[^}]*border:\s*1px solid var\(--home-frame-bright\);[^}]*border-radius:\s*var\(--home-frame-radius\);[^}]*background:\s*url\("\/assets\/lottery\/home-premium\/core-artwork\.webp"\)/s);
  assert.doesNotMatch(`${prototypeView}\n${visual}`, /matrix-core-(?:symbol-energy|energy-path|energy-loop|node)|matrix-core-energy-circulation|matrix-core-node-pulse/);
});
