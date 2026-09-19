import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

const css = readFileSync("src/matrix-explore-spacing.css", "utf8");
const featureCss = readFileSync("src/feature-pages.css", "utf8");
const main = readFileSync("src/main.tsx", "utf8");
const exploreSource = readFileSync("src/features/MatrixExplorePage.tsx", "utf8");

function oneRule(sourceText, selectorPattern) {
  const bodies = ruleBodies(sourceText, selectorPattern);
  assert.ok(bodies.length > 0);
  return bodies[0];
}

test("Matrix Explore canonical scoped stylesheet remains the final loaded layout source", () => {
  assert.match(main, /import "\.\/matrix-explore-spacing\.css";/);
  // 2706045 loads responsive CSS exactly once through the canonical spacing owner.
  assert.doesNotMatch(main, /import "\.\/responsive-feature-pages\.css";/);
  assert.match(css, /^@import "\.\/responsive-feature-pages\.css";/);
  assert.equal((css.match(/@import "\.\/responsive-feature-pages\.css";/g) ?? []).length, 1);
  const body = oneRule(css, /^\.matrix-explore-main-screen \.feature-body$/);
  assert.match(body, /width:\s*100%;/);
  assert.match(body, /max-width:\s*none;/);
  assert.match(body, /padding:\s*0 var\(--layout-page-inline\) var\(--layout-bottom-nav-clearance\);/);
  const title = oneRule(featureCss, /^\.product-header$/);
  assert.match(title, /width:\s*100%;/);
  assert.match(title, /padding:\s*0 var\(--layout-page-inline\);/);
  assert.doesNotMatch(css, /\.matrix-title-banner/);
});

test("Matrix Explore DOM keeps icon and field title in the same horizontal label group", () => {
  assert.match(exploreSource, /export function MatrixExplorePage/);
  assert.match(exploreSource, /<LotteryTabs selected=\{lottery\} onChange=\{changeLottery\} \/>[\s\S]*?<section className="panel explore-settings">/);
  assert.doesNotMatch(exploreSource, /<SettingLabelIcon type="lottery"/);
  assert.match(exploreSource, /<label><span><SettingLabelIcon type="period" \/>\{settingsName\}期數<\/span>/s);
  assert.match(exploreSource, /<label><span><SettingLabelIcon type="road" \/>版路類型<\/span>/s);
  assert.doesNotMatch(exploreSource, /style=\{/);
});

test("Matrix Explore setting icons are 28.8px", () => {
  const body = oneRule(css, /^\.matrix-explore-main-screen \.matrix-explore-setting-icon$/);
  assert.match(body, /inline-size:\s*1\.8rem;/);
  assert.match(body, /block-size:\s*1\.8rem;/);
  assert.match(body, /flex:\s*0 0 1\.8rem;/);
});

test("Matrix Explore 兩組三列圖示的垂直邊距都是 7px", () => {
  assert.match(oneRule(css, /^\.matrix-explore-main-screen \.advanced-panel$/), /row-gap:\s*7px;/);
  assert.match(oneRule(css, /^\.matrix-explore-main-screen \.advanced-panel label > \.advanced-setting-title$/), /padding-bottom:\s*0;/);
});

test("Matrix Explore native selects stay 24px and integrated period, road and hit options stay 20px", () => {
  assert.match(oneRule(css, /^\.matrix-explore-main-screen \.advanced-panel \.native-select$/), /height:\s*24px;[\s\S]*min-height:\s*24px;/);
  assert.match(oneRule(featureCss, /^\.native-select select$/), /height:\s*100%;/);
  for (const selector of [/^\.matrix-explore-main-screen \.segmented button$/, /^\.matrix-explore-main-screen \.hit-options button$/]) {
    const button = oneRule(css, selector);
    assert.match(button, /box-sizing:\s*border-box;/);
    assert.match(button, /height:\s*20px;[\s\S]*min-height:\s*20px;/);
    assert.match(button, /padding:\s*\.125rem \.25rem;/);
    assert.match(button, /flex:\s*1 1 0;/);
  }
});

test("Matrix Explore button badges sit above the upper-right border without covering option text", () => {
  assert.match(css, /\.matrix-explore-main-screen \.segmented button em\s*\{[^}]*position:\s*absolute;[^}]*top:\s*-\.5625rem;[^}]*right:\s*\.125rem;[^}]*padding:\s*\.0625rem \.125rem;[^}]*font-size:\s*\.4375rem;[^}]*white-space:\s*nowrap;/s);
  assert.doesNotMatch(css, /\.matrix-explore-main-screen \.segmented button em\s*\{[^}]*transform\s*:/s);
});

test("Matrix Explore scoped layout contains no compensating overrides or obsolete width locks", () => {
  assert.doesNotMatch(css, /!important/);
  assert.doesNotMatch(css, /margin(?:-[a-z]+)?:\s*-\d/);
  assert.doesNotMatch(css, /max-width:\s*(?:28rem|32rem)/);
});
