import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/feature-pages.css", "utf8");
const formalStart = "/* Matrix Explore formal layout rules */";
const formalEnd = "/* v55 scoped density and hierarchy refinements */";
const requestedSpacingMarker = "/* Matrix Explore requested spacing override */";
const formalStartIndex = css.indexOf(formalStart);
const formalEndIndex = css.indexOf(formalEnd);

assert.notEqual(formalStartIndex, -1, "Matrix Explore formal rule block must exist");
assert.notEqual(formalEndIndex, -1, "Matrix Explore formal rule block must have an end marker");
const formal = css.slice(formalStartIndex, formalEndIndex);
const requestedSpacing = formal.includes(requestedSpacingMarker)
  ? formal.slice(formal.indexOf(requestedSpacingMarker))
  : "";

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

test("Matrix Explore main preserves canonical control sizing", () => {
  assert.match(formal, /\.matrix-explore-main-screen \.explore-settings \.setting-grid \.select-box\s*\{[^}]*height:\s*24px;[^}]*min-height:\s*24px;[^}]*font-size:\s*13px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.advanced-panel \.select-box\s*\{[^}]*height:\s*24px;[^}]*min-height:\s*24px;[^}]*font-size:\s*13px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.explore-settings \.segmented\.three button\s*\{[^}]*height:\s*24px;[^}]*min-height:\s*24px;[^}]*font-size:\s*13px;/s);
  assert.match(formal, /\.matrix-explore-main-screen \.hit-options button\s*\{[^}]*height:\s*24px;[^}]*min-height:\s*24px;[^}]*font-size:\s*13px;/s);
});

test("Matrix Explore requested spacing override exists only in the formal block", () => {
  assert.equal(formal.split(requestedSpacingMarker).length - 1, 1);
  assert.notEqual(requestedSpacing, "");
});

test("Matrix Explore page and cards follow the requested 16px and 8px spacing", () => {
  assert.match(requestedSpacing, /\.matrix-explore-main-screen \.feature-body\s*\{[^}]*padding-inline:\s*16px;[^}]*gap:\s*8px;/s);
  assert.match(requestedSpacing, /\.matrix-explore-main-screen \.explore-settings,[\s\S]*?\.matrix-explore-main-screen \.hit-advanced-panel\s*\{[^}]*padding:\s*8px;/s);
});

test("Matrix Explore settings rows follow the requested title, row and label spacing", () => {
  assert.match(requestedSpacing, /\.matrix-explore-main-screen \.explore-settings \.setting-grid\s*\{[^}]*margin-top:\s*32px;[^}]*row-gap:\s*16px;/s);
  assert.match(requestedSpacing, /\.matrix-explore-main-screen \.explore-settings \.setting-grid label\s*\{[^}]*grid-template-columns:\s*max-content minmax\(0, 1fr\);[^}]*column-gap:\s*12px;/s);
  assert.match(requestedSpacing, /\.matrix-explore-main-screen \.explore-settings \.setting-grid label:first-child\s*\{[^}]*column-gap:\s*28px;/s);
  assert.match(requestedSpacing, /\.matrix-explore-main-screen \.explore-settings \.setting-grid label > span\s*\{[^}]*column-gap:\s*12px;/s);
  assert.match(requestedSpacing, /\.matrix-explore-main-screen \.explore-settings \.setting-grid label:first-child > span\s*\{[^}]*column-gap:\s*28px;/s);
  assert.match(requestedSpacing, /\.matrix-explore-main-screen \.explore-settings \.segmented\.three\s*\{[^}]*gap:\s*8px;/s);
});

test("Matrix Explore hit and advanced sections follow the requested spacing", () => {
  assert.match(requestedSpacing, /\.matrix-explore-main-screen \.hit-options\s*\{[^}]*gap:\s*8px;[^}]*margin-top:\s*24px;/s);
  assert.match(requestedSpacing, /\.matrix-explore-main-screen \.advanced-row\s*\{[^}]*margin-top:\s*8px;[^}]*column-gap:\s*8px;/s);
  assert.match(requestedSpacing, /\.matrix-explore-main-screen \.advanced-panel\s*\{[^}]*padding-top:\s*32px;[^}]*row-gap:\s*16px;/s);
  assert.match(requestedSpacing, /\.matrix-explore-main-screen \.advanced-panel label\s*\{[^}]*grid-template-columns:\s*max-content minmax\(0, 1fr\);[^}]*column-gap:\s*12px;/s);
  assert.match(requestedSpacing, /\.matrix-explore-main-screen \.advanced-panel label > \.advanced-setting-title\s*\{[^}]*column-gap:\s*12px;/s);
  assert.match(requestedSpacing, /\.matrix-explore-main-screen \.advanced-panel \.segmented\.three,[\s\S]*?\.matrix-explore-main-screen \.advanced-panel \.segmented\.two\s*\{[^}]*gap:\s*8px;/s);
});

test("Matrix Explore main primary action remains exactly 32px high", () => {
  assert.match(formal, /\.matrix-explore-main-screen \.primary-action\s*\{[^}]*height:\s*32px;[^}]*font-size:\s*13px;/s);
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
