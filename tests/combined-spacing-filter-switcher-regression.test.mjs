import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
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

test("homepage owns the approved 9–12px, 14px, and responsive navigation rhythm from one parent", async () => {
  const css = await read("src/homepage/base.css");
  const homeLayout = css.match(/\.home-screen \.home-layout \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const lotteryScreen = css.match(/\.home-screen \.lottery-screen \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const bottomGroup = css.match(/\.home-screen \.home-bottom-group \{([\s\S]*?)\n\}/)?.[1] ?? "";

  assert.match(homeLayout, /--home-gap-status-core:\s*clamp\(9px,\s*1\.35dvh,\s*12px\)/);
  assert.match(homeLayout, /--home-gap-core-features:\s*clamp\(14px,\s*1\.75dvh,\s*17px\)/);
  assert.match(homeLayout, /--home-gap-features-nav:\s*clamp\(8px,\s*1\.15dvh,\s*12px\)/);
  assert.match(homeLayout, /padding-bottom:\s*calc\(var\(--layout-bottom-nav-clearance\) \+ var\(--home-gap-features-nav\)\)/);
  assert.doesNotMatch(lotteryScreen, /--home-gap-(?:status-core|core-features)/);
  assert.doesNotMatch(bottomGroup, /padding-bottom:\s*8px|--home-gap-core-features\s*:/);
  assert.match(bottomGroup, /gap:\s*var\(--home-gap-core-features\)/);
  assert.match(css, /\.history-link\s*\{[\s\S]*?gap:\s*2px/);
});

test("single-number marking remains independent from the selected row", async () => {
  const source = await readFeaturePagesSource();
  const body = source.match(/const toggleMarkedCell = \(issue: string, number: string\) => \{([\s\S]*?)\n  \};/)?.[1] ?? "";
  assert.ok(body, "toggleMarkedCell should exist");
  assert.match(body, /setMarkedCells/);
  assert.doesNotMatch(body, /setMarkedRows/);
});

test("Matrix switcher exposes all four pages in one compact horizontal control", async () => {
  const [source, css] = await Promise.all([
    Promise.all([read("src/features/shared.tsx"), read("src/features/MatrixExplorePage.tsx"), read("src/features/MatrixTiangongPage.tsx")]).then(parts => parts.join("\n")),
    read("src/feature-pages.css"),
  ]);
  const switcher = source.slice(source.indexOf("function MatrixPageSwitcher"), source.indexOf("const ROAD_VALIDATION_SAMPLE_HISTORY"));
  assert.match(switcher, /MATRIX_PAGE_ITEMS\.map/);
  assert.match(switcher, /aria-current=\{item\.screen === current \? "page" : undefined\}/);
  assert.match(switcher, /onClick=\{\(\) => onNavigate\(item\.screen\)\}/);
  assert.match(source, /current=\{isTianheng \? "tianheng" : isTianyan \? "tianyan" : "explore"\}/);
  assert.match(source, /current="tiangong"/);
  assert.match(css, /\.matrix-page-switcher\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*stretch;[^}]*gap:\s*0;/s);
  assert.match(css, /\.matrix-page-switcher button\s*\{[^}]*min-width:\s*0;[^}]*height:\s*100%;[^}]*flex:\s*1 1 0;/s);
  assert.doesNotMatch(switcher, /MATRIX_LOOP_ITEMS|onScroll/);
  assert.doesNotMatch(css, /scroll-snap-type:\s*y mandatory|touch-action:\s*pan-y/);
});
