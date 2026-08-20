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

test("Matrix Explore control rows match the compact mobile reference density", () => {
  assert.match(css, /\.matrix-explore-main-screen \.feature-body\s*\{[^}]*gap:\s*\.375rem/s);
  assert.match(css, /\.explore-settings\s*\{[^}]*padding:\s*\.375rem/s);
  assert.match(css, /\.hit-advanced-panel\s*\{[^}]*padding:\s*\.375rem/s);

  const title = ruleBlock(css, "\\.matrix-explore-main-screen \\.panel \\.section-title");
  assert.match(title, /min-height:\s*1\.25rem/);
  assert.match(title, /gap:\s*\.375rem/);
  assert.match(title, /font-size:\s*\.875rem/);
  assert.match(title, /line-height:\s*1\.125rem/);

  const stack = ruleBlock(css, "\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid,[\\s\\S]*?\\.matrix-explore-main-screen \\.advanced-panel");
  assert.match(stack, /row-gap:\s*\.375rem/);
  assert.match(css, /\.explore-settings \.setting-grid\s*\{[^}]*margin-top:\s*\.375rem/s);

  const row = ruleBlock(css, "\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid label,[\\s\\S]*?\\.matrix-explore-main-screen \\.advanced-panel label");
  assert.match(row, /display:\s*flex/);
  assert.match(row, /width:\s*100%/);
  assert.match(row, /align-items:\s*center/);
  assert.match(row, /gap:\s*\.375rem/);

  const left = ruleBlock(css, "\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid label > span,[\\s\\S]*?\\.advanced-setting-title");
  assert.match(left, /width:\s*92px/);
  assert.match(left, /min-width:\s*92px/);
  assert.match(left, /flex:\s*0 0 92px/);
  assert.match(left, /font-size:\s*\.8125rem/);
  assert.match(css, /@media \(min-width:\s*40rem\)[\s\S]*?width:\s*108px/);

  const icon = ruleBlock(css, "\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid label > span \\.setting-label-icon,[\\s\\S]*?\\.matrix-explore-setting-icon");
  assert.match(icon, /inline-size:\s*1\.75rem/);
  assert.match(icon, /block-size:\s*1\.75rem/);

  const select = ruleBlock(css, "\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid \\.select-box,[\\s\\S]*?\\.matrix-explore-main-screen \\.advanced-panel \\.select-box");
  assert.match(select, /height:\s*28px/);
  assert.match(select, /min-height:\s*28px/);

  const three = ruleBlock(css, "\\.matrix-explore-main-screen \\.segmented\\.three");
  assert.match(three, /display:\s*flex/);
  assert.match(three, /gap:\s*\.375rem/);
  assert.doesNotMatch(three, /grid-template-columns/);

  const two = ruleBlock(css, "\\.matrix-explore-main-screen \\.segmented\\.two,[\\s\\S]*?\\.matrix-explore-main-screen \\.hit-options");
  assert.match(two, /display:\s*flex/);
  assert.match(two, /gap:\s*\.375rem/);

  const button = ruleBlock(css, "\\.matrix-explore-main-screen \\.segmented button,[\\s\\S]*?\\.hit-options button");
  assert.match(button, /height:\s*28px/);
  assert.match(button, /min-height:\s*28px/);
  assert.match(button, /padding:\s*\.125rem \.25rem/);
  assert.match(button, /border:\s*1px solid #334155/);

  assert.doesNotMatch(css, /zoom\s*:/);
  assert.doesNotMatch(css, /\.matrix-explore-main-screen \.explore-settings[^}]*transform\s*:/s);
  assert.doesNotMatch(css, /\.matrix-explore-main-screen \.hit-advanced-panel[^}]*transform\s*:/s);
});

test("Matrix Explore history table uses compact target proportions", () => {
  const heading = ruleBlock(css, "\\.matrix-explore-main-screen \\.history-panel \\.panel-heading");
  assert.match(heading, /display:\s*flex/);
  assert.match(heading, /justify-content:\s*space-between/);
  assert.match(heading, /min-height:\s*36px/);
  assert.match(heading, /padding:\s*\.25rem \.375rem/);

  const row = ruleBlock(css, "\\.matrix-explore-main-screen \\.history-row,[\\s\\S]*?\\.history-row:not\\(\\.history-head\\)");
  assert.match(row, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 2fr\) minmax\(0, 7fr\)/);
  assert.match(row, /min-height:\s*34px/);
  assert.match(row, /padding:\s*\.125rem 0/);
  assert.match(css, /\.history-row\.history-head\s*\{[^}]*min-height:\s*30px/);

  assert.match(ballCss, /\.matrix-explore-main-screen \.history-panel \.number-ball-component\.history-lottery-ball\s*\{[^}]*--number-ball-size:\s*clamp\(18px, 5\.2vw, 20px\);[^}]*--number-font-size:\s*clamp\(9px, 2\.4vw, 10px\);/s);
  assert.match(css, /\.matrix-explore-main-screen \.history-main-numbers\s*\{[^}]*gap:\s*clamp\(\.0625rem, \.5vw, \.125rem\);/s);
  assert.match(css, /@media \(max-width:\s*359\.98px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 2fr\) minmax\(0, 7fr\);/s);
});

test("Matrix Explore statistics and results use compact target density", () => {
  assert.match(css, /\.matrix-explore-main-screen \.repeat-stats-panel,\s*\.matrix-explore-main-screen \.result-panel\s*\{[^}]*padding:\s*\.75rem;/s);

  const statsHeading = ruleBlock(css, "\\.matrix-explore-main-screen \\.repeat-stats-heading");
  assert.match(statsHeading, /display:\s*flex/);
  assert.match(statsHeading, /gap:\s*\.375rem/);
  assert.match(statsHeading, /margin-bottom:\s*\.375rem/);

  const summary = ruleBlock(css, "\\.matrix-explore-main-screen \\.result-summary");
  assert.match(summary, /grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/);

  const card = ruleBlock(css, "\\.matrix-explore-main-screen \\.result-summary > div");
  assert.match(card, /min-height:\s*clamp\(36px, 10vw, 40px\)/);
  assert.match(card, /padding:\s*\.1875rem \.0625rem/);
  assert.match(card, /border-radius:\s*\.4375rem/);

  const resultTitle = ruleBlock(css, "\\.matrix-explore-main-screen \\.result-title");
  assert.match(resultTitle, /gap:\s*\.375rem/);
  assert.match(resultTitle, /margin-bottom:\s*\.375rem/);

  assert.match(css, /\.matrix-explore-main-screen \.road-results-head,[\s\S]*?\.matrix-explore-main-screen \.road-result-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1\.08fr\) minmax\(0, 1\.23fr\) minmax\(0, 1\.46fr\) minmax\(0, 1\.46fr\) minmax\(0, 1\.46fr\);/s);
  assert.match(css, /\.matrix-explore-main-screen \.road-results-head\s*\{[^}]*min-height:\s*32px/s);
  assert.match(css, /\.matrix-explore-main-screen \.road-result-row\s*\{[^}]*min-height:\s*46px;[^}]*padding:\s*\.375rem 0/s);
  assert.match(css, /\.matrix-explore-main-screen \.road-results \.tag\s*\{[^}]*padding:\s*\.125rem \.25rem;[^}]*font-size:\s*\.5625rem/s);
  assert.match(css, /\.matrix-explore-main-screen \.road-result-row > strong\s*\{[^}]*font-size:\s*\.875rem/s);
});
