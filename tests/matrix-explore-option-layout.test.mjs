import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/feature-pages.css", "utf8");
const formalStart = "/* Matrix Explore formal layout rules */";
const formalEnd = "/* v55 scoped density and hierarchy refinements */";
const formalStartIndex = css.indexOf(formalStart);
const formalEndIndex = css.indexOf(formalEnd);

assert.notEqual(formalStartIndex, -1, "Matrix Explore formal rule block must exist");
assert.notEqual(formalEndIndex, -1, "Matrix Explore formal rule block must have an end marker");
const formal = css.slice(formalStartIndex, formalEndIndex);

const mainRules = [...formal.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, selector]) => selector
    .split(",")
    .some((part) => part.includes(".matrix-explore-main-screen") && !part.includes(":not(.matrix-explore-main-screen)")))
  .map(([, selector, body]) => `${selector}{${body}}`)
  .join("\n");

test("Matrix Explore keeps one canonical formal layout source", () => {
  assert.equal(css.split(formalStart).length - 1, 1);
  assert.equal(formal.match(/\.matrix-explore-main-screen \.primary-action\s*\{/g)?.length ?? 0, 1);
  assert.doesNotMatch(formal, /!important/);
});

test("Matrix Explore main uses 8px section padding and 15px bold section titles", () => {
  assert.match(formal, /\.matrix-explore-main-screen \.explore-settings,[\s\S]*?\.matrix-explore-main-screen \.result-panel\s*\{[\s\S]*?padding:\s*8px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.panel:not\(\.explore-settings\) \.section-title\s*\{[^}]*font-size:\s*15px;[^}]*font-weight:\s*700;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.explore-settings > \.section-title\s*\{[^}]*font-size:\s*15px;[^}]*font-weight:\s*700;/s);
});

test("Matrix Explore main uses 8px gaps throughout the form layout", () => {
  assert.match(formal, /\.matrix-explore-main-screen \.explore-settings \.setting-grid\s*\{[^}]*margin-top:\s*8px;[^}]*gap:\s*8px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.explore-settings \.setting-grid label\s*\{[^}]*gap:\s*8px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.explore-settings \.segmented\.three\s*\{[^}]*gap:\s*8px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.advanced-panel \.segmented\.three\s*\{[^}]*gap:\s*8px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.segmented\.two,[\s\S]*?\.matrix-explore-main-screen \.hit-options\s*\{[^}]*gap:\s*8px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.advanced-panel\s*\{[^}]*padding-top:\s*8px;[^}]*gap:\s*8px;/s);
});

test("Matrix Explore main general controls are 24px high with 13px action text", () => {
  assert.match(formal, /\.matrix-explore-main-screen \.explore-settings \.setting-grid \.select-box\s*\{[^}]*height:\s*24px;[^}]*min-height:\s*24px;[^}]*font-size:\s*13px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.advanced-panel \.select-box\s*\{[^}]*height:\s*24px;[^}]*min-height:\s*24px;[^}]*font-size:\s*13px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.explore-settings \.segmented\.three button\s*\{[^}]*height:\s*24px;[^}]*min-height:\s*24px;[^}]*font-size:\s*13px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.advanced-panel \.segmented\.two button\s*\{[^}]*height:\s*24px;[^}]*min-height:\s*24px;[^}]*font-size:\s*13px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.hit-options button\s*\{[^}]*height:\s*24px;[^}]*min-height:\s*24px;[^}]*font-size:\s*13px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.advanced-row\s*\{[^}]*height:\s*24px;[^}]*min-height:\s*24px;[^}]*font-size:\s*13px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.repeat-stats-heading button\s*\{[^}]*height:\s*24px;[^}]*min-height:\s*24px;[^}]*font-size:\s*13px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.consecutive-filter-button\s*\{[^}]*height:\s*24px;[^}]*min-height:\s*24px;[^}]*font-size:\s*13px;/s);
});

test("Matrix Explore main primary action is exactly 32px high", () => {
  assert.match(formal, /\.matrix-explore-main-screen \.primary-action\s*\{[^}]*height:\s*32px;[^}]*font-size:\s*13px;/s);
});

test("Matrix Explore main labels, dates and explanatory text use 11px", () => {
  assert.match(formal, /\.matrix-explore-main-screen \.explore-settings \.setting-grid label > span\s*\{[^}]*font-size:\s*11px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.advanced-panel label > \.advanced-setting-title\s*\{[^}]*font-size:\s*11px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.repeat-stats-heading > span\s*\{[^}]*font-size:\s*11px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.repeat-stats-table th\s*\{[^}]*font-size:\s*11px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.explore-result-disclaimer\s*\{[^}]*font-size:\s*11px;/s);
});

test("Matrix Explore main table core data uses 13px", () => {
  assert.match(formal, /\.matrix-explore-main-screen \.repeat-stats-body\s*\{[^}]*font-size:\s*13px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.repeat-stats-table td\s*\{[^}]*font-size:\s*13px;/s);
});

test("Matrix Explore main formal rules contain no glow, shadow, gradient, hard pull, or thick border", () => {
  assert.doesNotMatch(mainRules, /box-shadow:(?!\s*none\b)[^;]+;/);
  assert.doesNotMatch(mainRules, /text-shadow\s*:/);
  assert.doesNotMatch(mainRules, /filter:\s*drop-shadow/i);
  assert.doesNotMatch(mainRules, /(?:linear|radial)-gradient\s*\(/i);
  assert.doesNotMatch(mainRules, /margin(?:-[a-z]+)?:\s*-\d/);
  assert.doesNotMatch(mainRules, /translate(?:X|Y)?\s*\(/i);
  assert.doesNotMatch(mainRules, /border(?:-width)?:\s*(?:[2-9]|\d{2,})px/i);
});
