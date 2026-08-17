import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/feature-pages.css", "utf8");
const tokens = readFileSync("src/design-tokens.css", "utf8");
const formalStart = "/* Matrix Explore formal layout rules */";
const formalEnd = "/* v55 scoped density and hierarchy refinements */";
const formalStartIndex = css.indexOf(formalStart);
const formalEndIndex = css.indexOf(formalEnd);

assert.notEqual(formalStartIndex, -1, "Matrix Explore formal rule block must exist");
assert.notEqual(formalEndIndex, -1, "Matrix Explore formal rule block must have an end marker");

const beforeFormal = css.slice(0, formalStartIndex);
const formal = css.slice(formalStartIndex, formalEndIndex);

test("Matrix Explore uses the 12px page-inline token as the single viewport spacing source", () => {
  assert.match(tokens, /--layout-page-inline:\s*12px;/);
  assert.match(css, /\.feature-body\s*\{[^}]*padding:\s*0 var\(--layout-page-inline\) 24px;/s);
  assert.match(css, /\.matrix-title-banner\s*\{[^}]*width:\s*calc\(100% - \(var\(--layout-page-inline\) \* 2\)\);/s);
  assert.doesNotMatch(css, /\.matrix-title-banner\s*\{[^}]*width:\s*calc\(100% - 24px\);/s);
});

test("Matrix Explore content width flows from its parent instead of a 366px viewport-derived lock", () => {
  assert.doesNotMatch(formal, /width:\s*366px;/);
  assert.match(formal, /\.matrix-explore-screen \.explore-settings,[\s\S]*?\.matrix-explore-screen \.result-panel\s*\{[^}]*width:\s*100%;/s);
  assert.match(formal, /\.matrix-explore-screen \.primary-action\s*\{[^}]*width:\s*100%;/s);
  assert.match(formal, /\.matrix-explore-screen \.explore-result-disclaimer\s*\{[^}]*width:\s*100%;/s);
});

test("stale Matrix Explore density rules are removed instead of being overridden later", () => {
  assert.doesNotMatch(beforeFormal, /\.explore-settings \.setting-grid,\s*\.advanced-panel\s*\{\s*gap:\s*8px;/s);
  assert.doesNotMatch(beforeFormal, /\.explore-settings \.segmented,[\s\S]*?\.advanced-panel \.select-box\s*\{\s*height:\s*36px;/s);
  assert.doesNotMatch(beforeFormal, /\.explore-settings \.setting-grid label:nth-child\(2\)[\s\S]*?height:\s*32px;/s);
  assert.doesNotMatch(beforeFormal, /\.advanced-row\s*\{[^}]*height:\s*52px;/s);
  assert.doesNotMatch(beforeFormal, /\.repeat-stats-panel,\s*\.result-panel\s*\{[^}]*width:\s*366px;/s);
});

test("confirmed component dimensions remain in the canonical Matrix Explore rules", () => {
  assert.match(formal, /\.matrix-explore-screen \.setting-grid \.select-box,[\s\S]*?height:\s*44px;[\s\S]*?min-height:\s*44px;/s);
  assert.match(formal, /\.matrix-explore-screen \.advanced-row\s*\{[^}]*height:\s*44px;[^}]*min-height:\s*44px;/s);
  assert.match(formal, /\.matrix-explore-screen \.primary-action\s*\{[^}]*height:\s*50px;/s);
  assert.match(formal, /\.matrix-explore-screen \.result-summary > div\s*\{[^}]*height:\s*48px;[^}]*min-height:\s*48px;/s);
});
