import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

const css = readFileSync("src/matrix-explore-spacing.css", "utf8");
const main = readFileSync("src/main.tsx", "utf8");
const source = readFileSync("src/FeaturePages.tsx", "utf8");
const exploreStart = source.indexOf("export function MatrixExplorePage");
const exploreEnd = source.indexOf("function MatrixTiangongPage");
const exploreSource = source.slice(exploreStart, exploreEnd);

function oneRule(sourceText, selectorPattern) {
  const bodies = ruleBodies(sourceText, selectorPattern);
  assert.ok(bodies.length > 0);
  return bodies[0];
}

test("Matrix Explore canonical scoped stylesheet remains the final loaded layout source", () => {
  assert.match(main, /import "\.\/matrix-explore-spacing\.css";/);
  assert.ok(main.indexOf('import "./matrix-explore-spacing.css";') > main.indexOf('import "./responsive-feature-pages.css";'));
  const body = oneRule(css, /^\.matrix-explore-main-screen \.feature-body$/);
  assert.match(body, /width:\s*100%;/);
  assert.match(body, /max-width:\s*none;/);
  assert.match(body, /padding:\s*0 var\(--layout-page-inline\) var\(--layout-bottom-nav-clearance\);/);
  const title = oneRule(css, /^\.matrix-explore-main-screen \.matrix-title-banner$/);
  assert.match(title, /width:\s*calc\(100% - \(var\(--layout-page-inline\) \* 2\)\);/);
  assert.match(title, /max-width:\s*none;/);
});

test("Matrix Explore DOM keeps icon and field title in the same horizontal label group", () => {
  assert.ok(exploreStart >= 0 && exploreEnd > exploreStart);
  assert.match(exploreSource, /<label><span>\{title === "Matrix 探索"[\s\S]*?matrix-explore-setting-icon[\s\S]*?<b>彩球類型<\/b><\/span>/s);
  assert.match(exploreSource, /<label><span>\{title === "Matrix 探索"[\s\S]*?period\.png[\s\S]*?探索期數<\/span>/s);
  assert.match(exploreSource, /<label><span>\{title === "Matrix 探索"[\s\S]*?road\.png[\s\S]*?版路類型<\/span>/s);
  assert.doesNotMatch(exploreSource, /style=\{/);
});

test("Matrix Explore setting icons are 28.8px", () => {
  const body = oneRule(css, /^\.matrix-explore-main-screen \.matrix-explore-setting-icon$/);
  assert.match(body, /inline-size:\s*1\.8rem;/);
  assert.match(body, /block-size:\s*1\.8rem;/);
  assert.match(body, /flex:\s*0 0 1\.8rem;/);
});

test("Matrix Explore 兩組三列圖示的垂直邊距都是 7px", () => {
  assert.match(oneRule(css, /^\.matrix-explore-main-screen \.advanced-panel$/), /row-gap:\s*7px;/);
  assert.match(oneRule(css, /^\.matrix-explore-main-screen \.advanced-panel label > \.advanced-setting-title$/), /padding-bottom:\s*0;/);
});

test("Matrix Explore selects and general option buttons are 24px high, hit options are 28px", () => {
  assert.match(oneRule(css, /^\.matrix-explore-main-screen \.advanced-panel \.select-box$/), /height:\s*24px;[\s\S]*min-height:\s*24px;/);
  assert.match(oneRule(css, /^\.matrix-explore-main-screen \.advanced-panel \.select-box select$/), /height:\s*24px;[\s\S]*min-height:\s*24px;/);
  assert.match(css, /\.matrix-explore-main-screen \.segmented button\s*\{[^}]*height:\s*24px;[^}]*min-height:\s*24px;/s);
  assert.match(css, /\.matrix-explore-main-screen \.hit-options button\s*\{[^}]*box-sizing:\s*border-box;[^}]*height:\s*28px;[^}]*min-height:\s*28px;[^}]*padding:\s*\.125rem \.25rem;[^}]*flex:\s*1 1 0;/s);
});

test("Matrix Explore button badges sit above the upper-right border without covering option text", () => {
  assert.match(css, /\.matrix-explore-main-screen \.segmented button em\s*\{[^}]*position:\s*absolute;[^}]*top:\s*-\.5625rem;[^}]*right:\s*\.125rem;[^}]*padding:\s*\.0625rem \.125rem;[^}]*font-size:\s*\.4375rem;[^}]*white-space:\s*nowrap;/s);
  assert.doesNotMatch(css, /\.matrix-explore-main-screen \.segmented button em\s*\{[^}]*transform\s*:/s);
});

test("Matrix Explore scoped layout contains no compensating overrides or obsolete width locks", () => {
  assert.doesNotMatch(css, /!important/);
  assert.doesNotMatch(css, /margin(?:-[a-z]+)?:\s*-\d/);
  assert.doesNotMatch(css, /max-width:\s*(?:28rem|32rem)/);
});
