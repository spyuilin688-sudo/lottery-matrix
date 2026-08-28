import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("history search uses the last edited date-or-range control as the active mode", async () => {
  const source = await read("src/FeaturePagesCore.tsx");
  assert.match(source, /historyFilterPriority/);
  assert.match(source, /setHistoryFilterPriority\("date"\)/);
  assert.match(source, /setHistoryFilterPriority\("range"\)/);
  assert.match(source, /dateIsPrimary = historyFilterPriority === "date"/);
  assert.match(source, /range: dateIsPrimary \? "所有期數" : range/);
});

test("homepage owns the canonical 10px, 14px and 8px gaps from one responsive parent", async () => {
  const css = await read("src/homepage/base.css");
  const homeLayout = css.match(/\.home-screen \.home-layout \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const lotteryScreen = css.match(/\.home-screen \.lottery-screen \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const bottomGroup = css.match(/\.home-screen \.home-bottom-group \{([\s\S]*?)\n\}/)?.[1] ?? "";

  assert.match(homeLayout, /--home-gap-status-core:\s*10px/);
  assert.match(homeLayout, /--home-gap-core-features:\s*14px/);
  assert.match(homeLayout, /--home-gap-features-nav:\s*8px/);
  assert.match(homeLayout, /padding-bottom:\s*calc\(var\(--layout-bottom-nav-clearance\) \+ var\(--home-gap-features-nav\)\)/);
  assert.doesNotMatch(lotteryScreen, /--home-gap-(?:status-core|core-features)/);
  assert.doesNotMatch(bottomGroup, /padding-bottom:\s*8px|--home-gap-core-features\s*:/);
  assert.match(css, /\.history-link\s*\{[\s\S]*?gap:\s*2px/);
});

test("single-number override never clears its selected row", async () => {
  const source = await read("src/FeaturePages.tsx");
  const body = source.match(/const toggleMarkedCell = \(issue: string, number: string\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
  assert.ok(body, "toggleMarkedCell should exist");
  assert.doesNotMatch(body, /setMarkedRows/);
  assert.match(body, /setMarkedCells/);
});

test("Matrix switcher exposes all three pages in one vertical scroll-snap control", async () => {
  const [source, css] = await Promise.all([
    read("src/FeaturePages.tsx"),
    read("src/feature-pages.css"),
  ]);
  const switcher = source.slice(source.indexOf("function MatrixPageSwitcher"), source.indexOf("const ROAD_VALIDATION_SAMPLE_HISTORY"));
  assert.match(switcher, /MATRIX_LOOP_ITEMS\.map/);
  assert.match(switcher, /onScroll/);
  assert.match(source, /title === "Matrix 天衍" \? "tianyan" : "explore"/);
  assert.match(source, /current="tiangong"/);
  assert.match(css, /\.matrix-page-switcher\s*\{[\s\S]*?width:\s*2\.34rem;[\s\S]*?flex-direction:\s*column/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(source, /const MATRIX_LOOP_ITEMS = \[MATRIX_PAGE_ITEMS\[2\], \.\.\.MATRIX_PAGE_ITEMS, MATRIX_PAGE_ITEMS\[0\]\]/);
  assert.match(css, /scroll-snap-type:\s*y mandatory/);
  assert.match(css, /touch-action:\s*pan-y/);
});
