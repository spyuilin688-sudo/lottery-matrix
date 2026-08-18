import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("src/matrix-explore-spacing.css", "utf8");
const ballCss = readFileSync("src/number-ball.css", "utf8");

function ruleBlock(source, selectorPattern) {
  const match = source.match(new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`, "s"));
  assert.ok(match, `Missing rule block for ${selectorPattern}`);
  return match[1];
}

test("Matrix Explore control rows use compact responsive density", () => {
  const stack = ruleBlock(css, "\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid,[\\s\\S]*?\\.matrix-explore-main-screen \\.advanced-panel");
  assert.match(stack, /row-gap:\s*\.5rem/);
  assert.match(css, /\.explore-settings \.setting-grid\s*\{[^}]*margin-top:\s*\.5rem/s);

  const row = ruleBlock(css, "\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid label,[\\s\\S]*?\\.matrix-explore-main-screen \\.advanced-panel label");
  assert.match(row, /display:\s*flex/);
  assert.match(row, /width:\s*100%/);
  assert.match(row, /align-items:\s*center/);
  assert.match(row, /gap:\s*\.5rem/);

  const left = ruleBlock(css, "\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid label > span,[\\s\\S]*?\\.advanced-setting-title");
  assert.match(left, /display:\s*flex/);
  assert.match(left, /width:\s*100px/);
  assert.match(left, /gap:\s*\.5rem/);
  assert.match(left, /font-size:\s*\.875rem/);
  assert.match(left, /font-weight:\s*700/);
  assert.match(left, /white-space:\s*nowrap/);
  assert.match(css, /@media \(min-width:\s*40rem\)[\s\S]*?width:\s*120px/);

  const icon = ruleBlock(css, "\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid label > span \\.setting-label-icon,[\\s\\S]*?\\.matrix-explore-setting-icon");
  assert.match(icon, /inline-size:\s*1\.75rem/);
  assert.match(icon, /block-size:\s*1\.75rem/);
  assert.match(icon, /border-radius:\s*\.5rem/);

  const button = ruleBlock(css, "\\.matrix-explore-main-screen \\.segmented button,[\\s\\S]*?\\.hit-options button");
  assert.match(button, /height:\s*36px/);
  assert.match(button, /min-height:\s*36px/);
  assert.match(button, /padding:\s*\.25rem \.375rem/);
  assert.match(button, /border:\s*1px solid #334155/);
  assert.match(button, /border-radius:\s*\.75rem/);
  assert.match(button, /white-space:\s*nowrap/);

  assert.match(css, /\.hit-advanced-panel\s*\{[^}]*padding:\s*\.5rem/s);
  assert.match(css, /\.hit-options\s*\{[^}]*padding:\s*0 0 \.5rem/s);
  assert.doesNotMatch(css, /transform:\s*(?:translate|scale)\([^)]*\)[^}]*\.explore-settings/s);
  assert.doesNotMatch(css, /zoom\s*:/);
});

test("Matrix Explore history table keeps 3-3-6 by default and opens to 2.5-2.5-7 below 360px", () => {
  const heading = ruleBlock(css, "\\.matrix-explore-main-screen \\.history-panel \\.panel-heading");
  assert.match(heading, /display:\s*flex/);
  assert.match(heading, /justify-content:\s*space-between/);
  assert.match(heading, /margin-bottom:\s*\.5rem/);

  const row = ruleBlock(css, "\\.matrix-explore-main-screen \\.history-row,[\\s\\S]*?\\.history-row:not\\(\\.history-head\\)");
  assert.match(row, /grid-template-columns:\s*repeat\(12,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(row, /padding:\s*\.5rem 0/);
  assert.match(row, /border-bottom:\s*1px solid rgba\(30, 41, 59, \.6\)/);
  assert.match(css, /:nth-child\(1\)\s*\{[^}]*grid-column:\s*span 3/);
  assert.match(css, /:nth-child\(2\)\s*\{[^}]*grid-column:\s*span 3/);
  assert.match(css, /:nth-child\(3\)\s*\{[^}]*grid-column:\s*span 6/);

  assert.match(css, /@media \(max-width:\s*359\.98px\)[\s\S]*?grid-template-columns:\s*2\.5fr 2\.5fr 7fr;[\s\S]*?gap:\s*\.125rem;/s);
  assert.match(css, /@media \(max-width:\s*359\.98px\)[\s\S]*?history-row > :nth-child\(3\)[\s\S]*?grid-column:\s*auto;/s);

  assert.match(ballCss, /\.matrix-explore-main-screen \.history-panel \.number-ball-component\.history-lottery-ball\s*\{[^}]*--number-ball-size:\s*clamp\(20px, 6vw, 28px\);[^}]*--number-font-size:\s*clamp\(10px, 2\.8vw, 12px\);/s);
  assert.doesNotMatch(ballCss, /\.matrix-explore-main-screen \.history-panel \.number-ball-component\.history-lottery-ball\s*\{[^}]*(?:1\.625rem|1\.875rem)/s);
  assert.match(css, /\.matrix-explore-main-screen \.history-main-numbers\s*\{[^}]*gap:\s*\.125rem;/s);
  assert.match(css, /@media \(max-width:\s*359\.98px\)[\s\S]*?\.history-special-ball\s*\{[^}]*width:\s*clamp\(20px, 6vw, 28px\)/s);
});

test("Matrix Explore statistics and results use six equal fluid columns", () => {
  const statsHeading = ruleBlock(css, "\\.matrix-explore-main-screen \\.repeat-stats-heading");
  assert.match(statsHeading, /display:\s*flex/);
  assert.match(statsHeading, /gap:\s*\.5rem/);
  assert.match(statsHeading, /margin-bottom:\s*\.75rem/);
  assert.match(css, /repeat-stats-heading > span\s*\{[^}]*margin-left:\s*auto;[^}]*font-size:\s*\.75rem/);

  const card = ruleBlock(css, "\\.matrix-explore-main-screen \\.result-summary > div");
  assert.match(card, /padding:\s*\.5rem/);
  assert.match(card, /border-radius:\s*\.75rem/);
  assert.match(card, /background:\s*#141A26/);
  assert.match(card, /border:\s*1px solid #1e293b/);

  const resultTitle = ruleBlock(css, "\\.matrix-explore-main-screen \\.result-title");
  assert.match(resultTitle, /display:\s*flex/);
  assert.match(resultTitle, /justify-content:\s*space-between/);
  assert.match(resultTitle, /gap:\s*\.5rem/);
  assert.match(resultTitle, /margin-bottom:\s*\.75rem/);

  assert.match(css, /\.matrix-explore-main-screen \.road-results-head,[\s\S]*?\.matrix-explore-main-screen \.road-result-row\s*\{[^}]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\);[^}]*gap:\s*\.5rem;/s);
  assert.match(css, /\.matrix-explore-main-screen \.road-result-row\s*\{[^}]*padding:\s*\.75rem 0;[^}]*border-bottom:\s*1px solid rgba\(30, 41, 59, \.6\)/s);
  assert.match(css, /\.matrix-explore-main-screen \.road-result-row > span,[\s\S]*?\.matrix-explore-main-screen \.road-result-row > button\s*\{[^}]*font-size:\s*\.75rem;/s);
  assert.match(css, /\.matrix-explore-main-screen \.road-results \.tag\s*\{[^}]*padding:\s*\.125rem \.5rem;[^}]*border-radius:\s*\.375rem;[^}]*font-size:\s*\.6875rem;[^}]*font-weight:\s*700/s);
});
