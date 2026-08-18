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
  assert.match(css, /\.matrix-explore-main-screen \.feature-body\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;[^}]*padding:\s*1rem 16px;[^}]*gap:\s*\.5rem;/s);
  assert.match(css, /\.matrix-explore-main-screen \.matrix-title-banner\s*\{[^}]*width:\s*calc\(100% - 32px\);[^}]*max-width:\s*none;/s);
});

test("Matrix Explore DOM keeps icon and field title in the same horizontal label group", () => {
  assert.ok(exploreStart >= 0 && exploreEnd > exploreStart);
  assert.match(exploreSource, /<label><span>\{title === "Matrix 探索"[\s\S]*?matrix-explore-setting-icon[\s\S]*?<b>彩種<\/b><\/span>/s);
  assert.match(exploreSource, /<label><span>\{title === "Matrix 探索"[\s\S]*?period\.png[\s\S]*?探索期數<\/span>/s);
  assert.match(exploreSource, /<label><span>\{title === "Matrix 探索"[\s\S]*?road\.png[\s\S]*?版路類型<\/span>/s);
  assert.doesNotMatch(exploreSource, /style=\{/);
});

test("Matrix Explore button badges are absolute and do not participate in parent sizing", () => {
  assert.match(css, /\.matrix-explore-main-screen \.segmented button em\s*\{[^}]*position:\s*absolute;[^}]*z-index:\s*10;[^}]*top:\s*-\.625rem;[^}]*right:\s*-\.25rem;[^}]*padding:\s*\.125rem \.375rem;[^}]*transform:\s*scale\(\.9\);[^}]*border-radius:\s*9999px;[^}]*font-size:\s*\.625rem;[^}]*white-space:\s*nowrap;/s);
});

test("Matrix Explore scoped layout contains no compensating overrides or obsolete width locks", () => {
  assert.doesNotMatch(css, /!important/);
  assert.doesNotMatch(css, /margin(?:-[a-z]+)?:\s*-\d/);
  assert.doesNotMatch(css, /translate(?:X|Y)?\s*\(/i);
  assert.doesNotMatch(css, /max-width:\s*(?:28rem|32rem)/);
});
