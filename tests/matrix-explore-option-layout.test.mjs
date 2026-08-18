import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/matrix-explore-spacing.css", "utf8");
const main = readFileSync("src/main.tsx", "utf8");

test("Matrix Explore requested spacing stylesheet is loaded", () => {
  assert.match(main, /import "\.\/matrix-explore-spacing\.css";/);
});

test("Matrix Explore page uses 16px horizontal spacing and 8px vertical spacing", () => {
  assert.match(css, /\.matrix-explore-main-screen \.feature-body\s*\{[^}]*padding-inline:\s*16px;[^}]*gap:\s*8px;/s);
  assert.match(css, /\.matrix-explore-main-screen \.matrix-title-banner\s*\{[^}]*width:\s*calc\(100% - 32px\);/s);
});

test("Matrix Explore settings card follows the requested spacing", () => {
  assert.match(css, /\.matrix-explore-main-screen \.explore-settings,[\s\S]*?\.matrix-explore-main-screen \.hit-advanced-panel\s*\{[^}]*padding:\s*8px;/s);
  assert.match(css, /\.matrix-explore-main-screen \.explore-settings \.setting-grid\s*\{[^}]*margin-top:\s*32px;[^}]*row-gap:\s*16px;/s);
  assert.match(css, /\.matrix-explore-main-screen \.explore-settings \.setting-grid label\s*\{[^}]*grid-template-columns:\s*max-content minmax\(0, 1fr\);[^}]*column-gap:\s*12px;/s);
  assert.match(css, /\.matrix-explore-main-screen \.explore-settings \.setting-grid label:first-child\s*\{[^}]*column-gap:\s*28px;/s);
  assert.match(css, /\.matrix-explore-main-screen \.explore-settings \.setting-grid label > span\s*\{[^}]*column-gap:\s*12px;/s);
  assert.match(css, /\.matrix-explore-main-screen \.explore-settings \.setting-grid label:first-child > span\s*\{[^}]*column-gap:\s*28px;/s);
  assert.match(css, /\.matrix-explore-main-screen \.explore-settings \.segmented\.three\s*\{[^}]*gap:\s*8px;/s);
});

test("Matrix Explore hit and advanced sections follow the requested spacing", () => {
  assert.match(css, /\.matrix-explore-main-screen \.hit-options\s*\{[^}]*gap:\s*8px;[^}]*margin-top:\s*24px;[^}]*padding-bottom:\s*0;/s);
  assert.match(css, /\.matrix-explore-main-screen \.advanced-row\s*\{[^}]*margin-top:\s*8px;[^}]*column-gap:\s*8px;/s);
  assert.match(css, /\.matrix-explore-main-screen \.advanced-panel\s*\{[^}]*padding-top:\s*32px;[^}]*row-gap:\s*16px;/s);
  assert.match(css, /\.matrix-explore-main-screen \.advanced-panel label\s*\{[^}]*grid-template-columns:\s*max-content minmax\(0, 1fr\);[^}]*column-gap:\s*12px;/s);
  assert.match(css, /\.matrix-explore-main-screen \.advanced-panel label > \.advanced-setting-title\s*\{[^}]*column-gap:\s*12px;/s);
  assert.match(css, /\.matrix-explore-main-screen \.advanced-panel \.segmented\.three,[\s\S]*?\.matrix-explore-main-screen \.advanced-panel \.segmented\.two\s*\{[^}]*gap:\s*8px;/s);
});

test("Matrix Explore spacing rules contain no negative margin or translate hard-pull", () => {
  assert.doesNotMatch(css, /margin(?:-[a-z]+)?:\s*-\d/);
  assert.doesNotMatch(css, /translate(?:X|Y)?\s*\(/i);
  assert.doesNotMatch(css, /!important/);
});
