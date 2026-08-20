import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("src/matrix-explore-spacing.css", "utf8");
const main = readFileSync("src/main.tsx", "utf8");
const source = readFileSync("src/FeaturePages.tsx", "utf8");
const exploreStart = source.indexOf("export function MatrixExplorePage");
const exploreEnd = source.indexOf("function MatrixTiangongPage");
const exploreSource = source.slice(exploreStart, exploreEnd);

test("Matrix Explore canonical scoped stylesheet remains the final loaded layout source", () => {
  assert.match(main, /import "\.\/matrix-explore-spacing\.css";/);
  assert.match(css, /\.matrix-explore-main-screen \.feature-body\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;[^}]*padding:\s*0 16px 1rem;/s);
  assert.match(css, /\.matrix-explore-main-screen \.matrix-title-banner\s*\{[^}]*width:\s*calc\(100% - 32px\);[^}]*max-width:\s*none;/s);
});

test("Matrix Explore DOM keeps icon and field title in the same horizontal label group", () => {
  assert.ok(exploreStart >= 0 && exploreEnd > exploreStart);
  assert.match(exploreSource, /<label><span>\{title === "Matrix 探索"[\s\S]*?matrix-explore-setting-icon[\s\S]*?<b>彩種<\/b><\/span>/s);
  assert.match(exploreSource, /<label><span>\{title === "Matrix 探索"[\s\S]*?period\.png[\s\S]*?探索期數<\/span>/s);
  assert.match(exploreSource, /<label><span>\{title === "Matrix 探索"[\s\S]*?road\.png[\s\S]*?版路類型<\/span>/s);
  assert.doesNotMatch(exploreSource, /style=\{/);
});

test("Matrix Explore setting icons are 32px", () => {
  assert.match(css, /\.matrix-explore-main-screen \.explore-settings \.setting-grid label > span \.setting-label-icon,[\s\S]*?\.matrix-explore-main-screen \.matrix-explore-setting-icon\s*\{[^}]*inline-size:\s*2rem;[^}]*block-size:\s*2rem;[^}]*flex:\s*0 0 2rem;/s);
});

test("Matrix Explore selects and option buttons are 24px high", () => {
  assert.match(css, /\.matrix-explore-main-screen \.explore-settings \.setting-grid \.select-box,[\s\S]*?\.matrix-explore-main-screen \.advanced-panel \.select-box\s*\{[^}]*height:\s*24px;[^}]*min-height:\s*24px;/s);
  assert.match(css, /\.matrix-explore-main-screen \.explore-settings \.setting-grid \.select-box select,[\s\S]*?\.matrix-explore-main-screen \.advanced-panel \.select-box select\s*\{[^}]*height:\s*24px;[^}]*min-height:\s*24px;/s);
  assert.match(css, /\.matrix-explore-main-screen \.segmented button,[\s\S]*?\.matrix-explore-main-screen \.hit-options button\s*\{[^}]*height:\s*24px;[^}]*min-height:\s*24px;/s);
});

test("Matrix Explore button badges are smaller and half-cover the upper-right border", () => {
  assert.match(css, /\.matrix-explore-main-screen \.segmented button em\s*\{[^}]*position:\s*absolute;[^}]*top:\s*-\.3125rem;[^}]*right:\s*\.125rem;[^}]*padding:\s*\.0625rem \.125rem;[^}]*font-size:\s*\.4375rem;[^}]*white-space:\s*nowrap;/s);
  assert.doesNotMatch(css, /\.matrix-explore-main-screen \.segmented button em\s*\{[^}]*transform\s*:/s);
});

test("Matrix Explore scoped layout contains no compensating overrides or obsolete width locks", () => {
  assert.doesNotMatch(css, /!important/);
  assert.doesNotMatch(css, /margin(?:-[a-z]+)?:\s*-\d/);
  assert.doesNotMatch(css, /max-width:\s*(?:28rem|32rem)/);
});
