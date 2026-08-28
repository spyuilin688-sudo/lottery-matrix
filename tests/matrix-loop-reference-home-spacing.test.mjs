import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pages = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const feature = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const reference = readFileSync(new URL("../src/number-reference-visual-refinement.css", import.meta.url), "utf8");
const home = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");

test("Matrix 三圖示放大 30%、隱藏捲動條並以頭尾複本循環", () => {
  assert.match(pages, /const MATRIX_LOOP_ITEMS = \[MATRIX_PAGE_ITEMS\[2\], \.\.\.MATRIX_PAGE_ITEMS, MATRIX_PAGE_ITEMS\[0\]\]/);
  assert.match(pages, /data-loop-clone/);
  assert.match(pages, /rawIndex === 0/);
  assert.match(pages, /rawIndex === MATRIX_LOOP_ITEMS\.length - 1/);
  assert.match(feature, /\.matrix-page-switcher\s*\{[^}]*width:\s*2\.34rem;[^}]*height:\s*2\.34rem;[^}]*scrollbar-width:\s*none;/s);
  assert.match(feature, /\.matrix-page-switcher::-webkit-scrollbar\s*\{[^}]*display:\s*none;/s);
});

test("號碼對照單由最後點擊覆蓋同一範圍且分隔線清楚", () => {
  const rowHandler = pages.slice(pages.indexOf("const toggleMarkedRow"), pages.indexOf("const toggleMarkedCell"));
  const cellHandler = pages.slice(pages.indexOf("const toggleMarkedCell"), pages.indexOf("const startReferenceSearch"));
  assert.match(rowHandler, /setMarkedCells/);
  assert.doesNotMatch(cellHandler, /setMarkedRows/);
  assert.match(reference, /data-row-marked="true"[^}]*button\[data-cell-marked="true"\]\s*\{[^}]*background:\s*rgba\(224, 124, 24, \.68\)/s);
  assert.match(reference, /border-left:\s*2px solid rgba\(212, 168, 72, \.88\)/);
});

test("首頁使用指定 8px 功能外距與導覽淨空、16px 資訊容器外距及 6px 區段間距", () => {
  assert.match(home, /--home-feature-inline:\s*8px/);
  assert.match(home, /--home-gap-features-nav:\s*8px/);
  assert.match(home, /--home-gap-switcher-draw:\s*6px/);
  assert.match(home, /--home-content-width:\s*calc\(min\(100vw, 390px\) - 32px\)/);
  assert.match(home, /\.home-screen \.latest-draw-card\s*\{[^}]*width:\s*calc\(100% - 32px\)/s);
  assert.match(home, /\.home-screen \.matrix-status-section\s*\{[^}]*width:\s*calc\(100% - 32px\)/s);
  assert.match(home, /\.home-screen \.home-shortcut-row\s*\{[^}]*width:\s*calc\(100% - \(var\(--home-feature-inline\) \* 2\)\)/s);
  assert.doesNotMatch(home, /\.home-screen \.home-shortcut-row\s*\{[^}]*margin-block-start:\s*0/s);
});
