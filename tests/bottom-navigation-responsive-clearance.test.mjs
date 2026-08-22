import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mainSource = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
const clearanceCss = await readFile(new URL("../src/bottom-nav-responsive-clearance.css", import.meta.url), "utf8");

test("響應式底部避讓規則在 Matrix 探索樣式之後載入", () => {
  const exploreImport = mainSource.indexOf('import "./matrix-explore-spacing.css";');
  const clearanceImport = mainSource.indexOf('import "./bottom-nav-responsive-clearance.css";');

  assert.ok(exploreImport >= 0);
  assert.ok(clearanceImport > exploreImport);
});

test("Matrix 探索與連碰立柱共用導覽高度加瀏覽器安全區", () => {
  assert.match(clearanceCss, /\.matrix-explore-main-screen\s*\{[^}]*--layout-bottom-nav-clearance:\s*calc\(var\(--bottom-navigation-height\) \+ env\(safe-area-inset-bottom,\s*0px\)\);/s);
  assert.match(clearanceCss, /\.matrix-explore-main-screen \.feature-body,\s*\.calculator-screen > \.feature-body\s*\{[^}]*padding-bottom:\s*var\(--layout-bottom-nav-clearance\);/s);
  assert.doesNotMatch(clearanceCss, /padding-bottom:\s*80px/);
});
