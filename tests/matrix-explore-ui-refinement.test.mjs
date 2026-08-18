import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("src/matrix-explore-spacing.css", "utf8");
const prototypeCss = readFileSync("src/prototype.css", "utf8");

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
  assert.match(icon, /inline-size:\s*1\.75rem/);
  assert.match(icon, /block-size:\s*1\.75rem/);
  assert.match(icon, /flex:\s*0 0 1\.75rem/);

  const select = ruleBlock(css, "\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid \\.select-box,[\\s\\S]*?\\.matrix-explore-main-screen \\.advanced-panel \\.select-box");
  assert.match(select, /height:\s*28px/);
  assert.match(select, /min-height:\s*28px/);
  assert.match(css, /\.setting-grid \.select-box select,[\s\S]*?\.advanced-panel \.select-box select\s*\{[^}]*height:\s*28px;[^}]*min-height:\s*28px;/s);

  const button = ruleBlock(css, "\\.matrix-explore-main-screen \\.segmented button,[\\s\\S]*?\\.hit-options button");
  assert.match(button, /height:\s*28px/);
  assert.match(button, /min-height:\s*28px/);
  assert.match(button, /align-items:\s*center/);
  assert.match(button, /justify-content:\s*center/);
  assert.match(button, /font-size:\s*\.75rem/);
  assert.match(button, /line-height:\s*1/);

  const hit = ruleBlock(css, "\\.matrix-explore-main-screen \\.hit-options");
  assert.match(hit, /margin:\s*\.375rem 0 0/);

  const advancedIcon = ruleBlock(css, "\\.matrix-explore-main-screen \\.advanced-row > img:first-child");
  assert.match(advancedIcon, /inline-size:\s*1\.75rem/);
  assert.match(advancedIcon, /block-size:\s*1\.75rem/);

  const badge = ruleBlock(css, "\\.matrix-explore-main-screen \\.segmented button em");
  assert.match(badge, /position:\s*absolute/);
  assert.match(badge, /top:\s*-\.625rem/);
  assert.match(badge, /right:\s*\.125rem/);
  assert.match(badge, /padding:\s*\.0625rem \.25rem/);
  assert.match(badge, /font-size:\s*\.5625rem/);
  assert.doesNotMatch(badge, /transform\s*:/);

  assert.doesNotMatch(css, /!important/);
  assert.doesNotMatch(css, /margin(?:-top|-right|-bottom|-left)?:\s*-/);
  assert.doesNotMatch(css, /zoom\s*:/);
});
