import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");
function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(escaped + "\\s*\\{([^}]*)\\}", "s"))?.[1] ?? "";
}

test("five homepage feature cards shrink fluidly to keep a visible 8px gap", () => {
  const row = ruleBody(".home-screen .home-shortcut-row");
  const button = ruleBody(".home-screen .home-shortcut");
  const image = ruleBody(".home-screen .home-shortcut img");
  const bottomGroup = ruleBody(".home-screen .home-bottom-group");

  assert.match(bottomGroup, /--home-feature-gap:\s*8px;/);
  assert.match(bottomGroup, /grid-template-rows:\s*auto auto;/);
  assert.match(row, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(row, /column-gap:\s*var\(--home-feature-gap,\s*8px\);/);
  assert.match(button, /aspect-ratio:\s*386\s*\/\s*496;/);
  assert.match(button, /border:\s*0;/);
  assert.match(button, /box-shadow:\s*none;/);
  assert.match(button, /overflow:\s*visible;/);
  assert.match(image, /width:\s*100%;/);
  assert.match(image, /height:\s*100%;/);
  assert.match(image, /object-fit:\s*fill;/);
  assert.match(image, /border:\s*0;/);
  assert.match(image, /border-radius:\s*0;/);
});
