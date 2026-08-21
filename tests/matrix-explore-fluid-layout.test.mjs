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
  assert.match(css, /\.matrix-explore-main-screen \.feature-body\s*\{[^}]*row-gap:\s*8px/s);
  assert.match(css, /\.explore-settings\s*\{[^}]*padding:\s*6px/s);
  assert.match(css, /\.hit-advanced-panel\s*\{[^}]*padding:\s*6px 6px 4px/s);

  const title = ruleBlock(css, "\\.matrix-explore-main-screen \\.panel \\.section-title");
  assert.match(title, /min-height:\s*1\.25rem/);
  assert.match(title, /gap:\s*\.375rem/);
  assert.match(title, /font-size:\s*14px/);
  assert.match(title, /line-height:\s*1\.125rem/);

  const stack = ruleBlock(css, "\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid,[\\s\\S]*?\\.matrix-explore-main-screen \\.advanced-panel");
  assert.match(stack, /row-gap:\s*5px/);
  assert.match(css, /\.explore-settings \.setting-grid\s*\{[^}]*margin-top:\s*8px/s);

  const row = ruleBlock(css, "\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid label,[\\s\\S]*?\\.matrix-explore-main-screen \\.advanced-panel label");
  assert.match(row, /display:\s*flex/);
  assert.match(row, /width:\s*100%/);
  assert.match(row, /align-items:\s*center/);
  assert.match(row, /gap:\s*\.375rem/);

  const left = ruleBlock(css, "\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid label > span,[\\s\\S]*?\\.advanced-setting-title");
  assert.match(left, /width:\s*auto/);
  assert.match(left, /min-width:\s*92px/);
  assert.match(left, /flex:\s*0 0 auto/);
  assert.match(left, /font-size:\s*\.8125rem/);
  assert.match(css, /@media \(min-width:\s*40rem\)[\s\S]*?min-width:\s*108px/);

  const icon = ruleBlock(css, "\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid label > span \\.setting-label-icon,[\\s\\S]*?\\.matrix-explore-setting-icon");
  assert.match(icon, /inline-size:\s*2rem/);
  assert.match(icon, /block-size:\s*2rem/);

  const select = ruleBlock(css, "\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid \\.select-box,[\\s\\S]*?\\.matrix-explore-main-screen \\.advanced-panel \\.select-box");
  assert.match(select, /height:\s*24px/);
  assert.match(select, /min-height:\s*24px/);

  const three = ruleBlock(css, "\\.matrix-explore-main-screen \\.segmented\\.three");
  assert.match(three, /display:\s*flex/);
  assert.match(three, /gap:\s*\.375rem/);
  assert.doesNotMatch(three, /grid-template-columns/);

  const two = ruleBlock(css, "\\.matrix-explore-main-screen \\.segmented\\.two,[\\s\\S]*?\\.matrix-explore-main-screen \\.hit-options");
  assert.match(two, /display:\s*flex/);
  assert.match(two, /gap:\s*\.375rem/);

  const button = ruleBlock(css, "\\.matrix-explore-main-screen \\.segmented button");
  assert.match(button, /height:\s*24px/);
  assert.match(button, /min-height:\s*24px/);
  assert.match(button, /padding:\s*\.125rem \.25rem/);
  assert.match(button, /border:\s*1px solid #334155/);

  const hitButton = ruleBlock(css, "\\.matrix-explore-main-screen \\.hit-options button");
  assert.match(hitButton, /height:\s*28px/);
  assert.match(hitButton, /min-height:\s*28px/);

  assert.doesNotMatch(css, /zoom\s*:/);
  assert.doesNotMatch(css, /\.matrix-explore-main-screen \.explore-settings[^}]*transform\s*:/s);
  assert.doesNotMatch(css, /\.matrix-explore-main-screen \.hit-advanced-panel[^}]*transform\s*:/s);
});

test("Matrix Explore history table uses compact target proportions", () => {
  const heading = ruleBlock(css, "\\.matrix-explore-main-screen \\.history-panel \\.panel-heading");
  assert.match(heading, /display:\s*flex/);
  assert.match(heading, /justify-content:\s*space-between/);
  assert.match(heading, /min-height:\s*32px/);
  assert.match(heading, /padding:\s*5px 6px/);

  const row = ruleBlock(css, "\\.matrix-explore-main-screen \\.history-row,[\\s\\S]*?\\.history-row:not\\(\\.history-head\\)");
  assert.match(row, /grid-template-columns:\s*minmax\(0, \.65fr\) minmax\(0, \.85fr\) minmax\(0, 3\.5fr\)/);
  assert.match(row, /height:\s*40px/);
  assert.match(row, /min-height:\s*40px/);
  assert.match(row, /padding:\s*0/);
  assert.match(css, /\.history-row\.history-head\s*\{[^}]*height:\s*26px;[^}]*min-height:\s*26px/);
  assert.match(css, /data-lottery="今彩539"[^}]*data-lottery="天天樂"[^}]*\.history-row:not\(\.history-head\)\s*\{[^}]*height:\s*32px;[^}]*min-height:\s*32px/s);
  assert.match(css, /data-lottery="六合彩"[^}]*data-lottery="大樂透"[^}]*\.history-row:not\(\.history-head\)\s*\{[^}]*height:\s*40px;[^}]*min-height:\s*40px/s);

  assert.match(ballCss, /\.matrix-explore-main-screen \.history-panel:is\(\[data-lottery="今彩539"\], \[data-lottery="天天樂"\]\) \.number-ball-component\.history-lottery-ball\s*\{[^}]*--number-ball-size:\s*clamp\(24px, 7\.18vw, 28px\);[^}]*--number-font-size:\s*clamp\(12px, 3\.59vw, 14px\);/s);
  assert.match(css, /\.matrix-explore-main-screen \.history-main-numbers\s*\{[^}]*gap:\s*clamp\(4px, 1\.8vw, 8px\);/s);
});

test("Matrix Explore statistics and results use compact target density", () => {
  assert.match(css, /\.matrix-explore-main-screen \.repeat-stats-panel\s*\{[^}]*margin-top:\s*4px;[^}]*padding:\s*10px 6px;/s);
  assert.match(css, /\.matrix-explore-main-screen \.result-panel\s*\{[^}]*padding:\s*6px 6px 12px;/s);

  const statsHeading = ruleBlock(css, "\\.matrix-explore-main-screen \\.repeat-stats-heading");
  assert.match(statsHeading, /display:\s*flex/);
  assert.match(statsHeading, /gap:\s*\.375rem/);
  assert.match(statsHeading, /margin-bottom:\s*8px/);

  const summary = ruleBlock(css, "\\.matrix-explore-main-screen \\.result-summary");
  assert.match(summary, /grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/);

  const card = ruleBlock(css, "\\.matrix-explore-main-screen \\.result-summary > div");
  assert.match(card, /min-height:\s*clamp\(36px, 10vw, 40px\)/);
  assert.match(card, /padding:\s*\.1875rem \.0625rem/);
  assert.match(card, /border-radius:\s*\.4375rem/);

  const resultTitle = ruleBlock(css, "\\.matrix-explore-main-screen \\.result-title");
  assert.match(resultTitle, /gap:\s*\.375rem/);
  assert.match(resultTitle, /margin-bottom:\s*8px/);

  assert.match(css, /\.matrix-explore-main-screen \.road-results-head,[\s\S]*?\.matrix-explore-main-screen \.road-result-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1\.08fr\) minmax\(0, 1\.23fr\) minmax\(0, 1\.6fr\) minmax\(0, 1\.35fr\) minmax\(0, 1\.6fr\);/s);
  assert.match(css, /\.matrix-explore-main-screen \.road-results-head\s*\{[^}]*min-height:\s*32px;[^}]*border-bottom:\s*1px solid rgba\(117, 83, 41, \.45\)/s);
  assert.match(css, /\.matrix-explore-main-screen \.road-result-row\s*\{[^}]*min-height:\s*46px;[^}]*padding:\s*\.375rem 0/s);
  assert.match(css, /\.matrix-explore-main-screen \.road-results \.tag\s*\{[^}]*padding:\s*\.125rem \.25rem;[^}]*font-size:\s*\.5625rem/s);
  assert.match(css, /\.matrix-explore-main-screen \.road-result-row > strong\s*\{[^}]*font-size:\s*\.875rem/s);
});
