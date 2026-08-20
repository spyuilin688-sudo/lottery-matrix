import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("src/matrix-explore-spacing.css", "utf8");
const prototypeCss = readFileSync("src/prototype.css", "utf8");
const featureCss = readFileSync("src/feature-pages.css", "utf8");
const featureSource = readFileSync("src/FeaturePages.tsx", "utf8");

function ruleBlock(source, selectorPattern) {
  const match = source.match(new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`, "s"));
  assert.ok(match, `Missing rule block for ${selectorPattern}`);
  return match[1];
}

test("Matrix Explore icons, controls, spacing and badges use the refined mobile rules", () => {
  const root = ruleBlock(css, "\\.matrix-explore-main-screen");
  assert.match(root, /--layout-bottom-nav-clearance:\s*calc\(var\(--bottom-navigation-height\) \+ var\(--mobile-safe-area-height, 34px\)\)/);
  assert.match(prototypeCss, /\.bottom-nav-brand-screen:not\(\.notifications-screen\) > \.feature-body\s*\{[^}]*padding-bottom:\s*var\(--layout-bottom-nav-clearance\)/s);

  const left = ruleBlock(css, "\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid label > span,[\\s\\S]*?\\.advanced-setting-title");
  assert.match(left, /gap:\s*\.5rem/);
  assert.match(left, /font-size:\s*\.8125rem/);

  const icon = ruleBlock(css, "\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid label > span \\.setting-label-icon,[\\s\\S]*?\\.matrix-explore-setting-icon");
  assert.match(icon, /inline-size:\s*2rem/);
  assert.match(icon, /block-size:\s*2rem/);
  assert.match(icon, /flex:\s*0 0 2rem/);

  const select = ruleBlock(css, "\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid \\.select-box,[\\s\\S]*?\\.matrix-explore-main-screen \\.advanced-panel \\.select-box");
  assert.match(select, /height:\s*24px/);
  assert.match(select, /min-height:\s*24px/);

  const button = ruleBlock(css, "\\.matrix-explore-main-screen \\.segmented button");
  assert.match(button, /height:\s*24px/);
  assert.match(button, /min-height:\s*24px/);
  assert.match(button, /align-items:\s*center/);
  assert.match(button, /justify-content:\s*center/);
  assert.match(button, /text-align:\s*center/);
  assert.match(button, /padding:\s*\.125rem \.25rem/);
  assert.match(button, /font-size:\s*\.75rem/);
  assert.match(button, /line-height:\s*1/);

  assert.match(css, /\.matrix-explore-main-screen \.hit-options\s*\{[^}]*width:\s*100%;[^}]*margin:\s*8px 0 4px;[^}]*padding:\s*0 0 4px;/s);

  const badge = ruleBlock(css, "\\.matrix-explore-main-screen \\.segmented button em");
  assert.match(badge, /position:\s*absolute/);
  assert.match(badge, /right:\s*\.125rem/);
  assert.match(badge, /padding:\s*\.0625rem \.125rem/);
  assert.match(badge, /font-size:\s*\.4375rem/);
  assert.doesNotMatch(badge, /transform\s*:/);

  assert.doesNotMatch(prototypeCss, /--debug-container-/);
  assert.doesNotMatch(prototypeCss, /Temporary global container debug outlines/);
  assert.doesNotMatch(css, /!important/);
  assert.doesNotMatch(css, /margin(?:-top|-right|-bottom|-left)?:\s*-/);
  assert.doesNotMatch(css, /zoom\s*:/);
});

test("Matrix Explore action details keep the approved compact presentation", () => {
  assert.match(featureSource, /useState\("本日 \(最新\)"\)/);
  assert.match(featureSource, /\["本日 \(最新\)", "昨日 \(上1期\)", "前日 \(上2期\)"\]/);
  assert.doesNotMatch(featureSource, /\["本日（最新）", "昨日（上1期）", "前日（上2期）"\]/);

  assert.match(css, /\.matrix-explore-main-screen \.history-panel-order\s*\{[^}]*display:\s*inline;[^}]*white-space:\s*nowrap;/s);

  const advanced = ruleBlock(css, "\\.matrix-explore-main-screen \\.advanced-row");
  assert.match(advanced, /padding-inline-end:\s*\.375rem/);
  const arrow = ruleBlock(css, "\\.matrix-explore-main-screen \\.advanced-row svg:last-child");
  assert.match(arrow, /inline-size:\s*1rem/);
  assert.match(arrow, /block-size:\s*1rem/);

  const action = ruleBlock(css, "\\.matrix-explore-main-screen \\.primary-action");
  assert.match(action, /min-height:\s*34px/);
  assert.match(action, /padding:\s*\.25rem \.75rem/);
  assert.match(action, /justify-content:\s*center/);
  assert.doesNotMatch(action, /background\s*:/);

  assert.match(featureCss, /\.branded-explore-action\s*\{[\s\S]*?radial-gradient/s);
});
