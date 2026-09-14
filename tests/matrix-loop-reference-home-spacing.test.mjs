import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pages = readFeaturePagesSource();
const feature = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const reference = readFileSync(new URL("../src/number-reference-visual-refinement.css", import.meta.url), "utf8");
const home = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");

test("Matrix 切換器固定顯示四頁並標示目前頁面，移除循環複本與捲動切換", () => {
  const switcher = pages.slice(pages.indexOf("function MatrixPageSwitcher"), pages.indexOf("const ROAD_VALIDATION_SAMPLE_HISTORY"));
  assert.match(switcher, /MATRIX_PAGE_ITEMS\.map/);
  assert.match(switcher, /aria-current=\{item\.screen === current \? "page" : undefined\}/);
  assert.doesNotMatch(switcher, /MATRIX_LOOP_ITEMS|data-loop-clone|onScroll|scrollTo/);
  assert.match(feature, /\.matrix-page-switcher\s*\{[^}]*display:\s*flex;[^}]*width:\s*176px;[^}]*height:\s*26px;[^}]*gap:\s*0;[^}]*border:\s*1px solid rgba\(117, 83, 41, \.48\);/s);
});

test("號碼對照單整列與單格標記彼此獨立且分隔線清楚", () => {
  const rowHandler = pages.slice(pages.indexOf("const toggleMarkedRow"), pages.indexOf("const toggleMarkedCell"));
  const cellHandler = pages.slice(pages.indexOf("const toggleMarkedCell"), pages.indexOf("const startReferenceSearch"));
  assert.match(rowHandler, /setMarkedCells/);
  assert.doesNotMatch(cellHandler, /setMarkedRows/);
  assert.match(reference, /data-row-marked="true"[^}]*button\[data-cell-marked="true"\]\s*\{[^}]*background:\s*rgba\(224, 124, 24, \.68\)/s);
  assert.match(reference, /border-left:\s*1px solid rgba\(161, 112, 40, \.78\)/);
});

test("首頁使用 16px 功能內距與響應式導覽淨空及更新後區段間距", () => {
  assert.match(home, /--home-feature-inline:\s*16px/);
  assert.match(home, /--home-gap-features-nav:\s*clamp\(8px,\s*1\.15dvh,\s*12px\)/);
  assert.match(home, /--home-gap-switcher-draw:\s*clamp\(7px,\s*calc\(0\.9dvh\s*\+\s*1px\),\s*9px\)/);
  assert.match(home, /--home-content-width:\s*calc\(min\(100vw, 390px\) - 32px\)/);
  assert.match(home, /\.home-screen \.latest-draw-card\s*\{[^}]*width:\s*calc\(100% - 32px\)/s);
  assert.match(home, /\.home-screen \.matrix-status-section\s*\{[^}]*width:\s*calc\(100% - 32px\)/s);
  assert.match(home, /\.home-screen \.home-shortcut-row\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[^}]*width:\s*calc\(100% - var\(--home-feature-inline\) \* 2\);[^}]*padding:\s*0;[^}]*gap:\s*var\(--home-feature-gap\);/s);
  assert.doesNotMatch(home, /\.home-screen \.home-shortcut-row\s*\{[^}]*margin-block-start:\s*0/s);
});
