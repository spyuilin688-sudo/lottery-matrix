import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");
const visualCss = readFileSync(new URL("../src/homepage/visual-language.css", import.meta.url), "utf8");

function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(escaped + "\\s*\\{([^}]*)\\}", "s"))?.[1] ?? "";
}

test("five homepage feature cards keep 8px outer margins and responsive 2 to 2.5px container gaps", () => {
  const row = ruleBody(".home-screen .home-shortcut-row");
  const button = ruleBody(".home-screen .home-shortcut");
  const image = ruleBody(".home-screen .home-shortcut img");

  assert.match(row, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(row, /width:\s*calc\(100% - \(var\(--home-feature-inline\) \* 2\)\);/);
  assert.match(row, /column-gap:\s*clamp\(2px, \.64vw, 2\.5px\);/);
  assert.match(button, /width:\s*100%;/);
  assert.match(button, /justify-self:\s*center;/);
  assert.match(button, /aspect-ratio:\s*386\s*\/\s*496;/);
  assert.match(button, /border:\s*var\(--lottery-stroke-default\) solid var\(--home-frame-border\);/);
  assert.match(button, /border-radius:\s*var\(--lottery-card-radius\);/);
  assert.match(button, /box-shadow:\s*var\(--home-frame-shadow\);/);
  assert.match(button, /overflow:\s*visible;/);
  assert.match(image, /width:\s*100%;/);
  assert.match(image, /height:\s*100%;/);
  assert.match(image, /object-fit:\s*fill;/);
  assert.match(image, /border:\s*0;/);
  assert.match(image, /border-radius:\s*calc\(var\(--lottery-card-radius\) - var\(--lottery-stroke-default\)\);/);
});

test("homepage feature cards have one canonical CSS owner without late overrides", () => {
  const rowRules = css.match(/\.home-screen \.home-shortcut-row\s*\{/g) ?? [];

  assert.equal(rowRules.length, 1);
  assert.doesNotMatch(visualCss, /\.home-shortcut(?:\b|[.: ])/);
  assert.match(css, /\.home-screen \.home-shortcut:active\s*\{[^}]*box-shadow:\s*var\(--home-frame-shadow-active\);/s);
  assert.match(css, /\.home-screen :where\(\.home-shortcut\):focus-visible\s*\{[^}]*outline:\s*2px solid var\(--lottery-gold-300\);/s);
});
