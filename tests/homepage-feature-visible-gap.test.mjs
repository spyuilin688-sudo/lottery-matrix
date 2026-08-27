import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");
function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(escaped + "\\s*\\{([^}]*)\\}", "s"))?.[1] ?? "";
}

test("five homepage feature cards are equal-width with a visible 4px gap", () => {
  const root = ruleBody(".home-screen .lottery-screen");
  const row = ruleBody(".home-screen .home-shortcut-row");
  const button = ruleBody(".home-screen .home-shortcut");
  const image = ruleBody(".home-screen .home-shortcut img");
  const bottomGroup = ruleBody(".home-screen .home-bottom-group");

  assert.match(root, /--home-feature-gap:\s*4px;/);
  assert.match(bottomGroup, /grid-template-rows:\s*auto auto;/);
  assert.match(row, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(row, /height:\s*auto;/);
  assert.match(row, /aspect-ratio:\s*auto;/);
  assert.match(button, /height:\s*auto;/);
  assert.match(image, /width:\s*100%;/);
  assert.match(image, /height:\s*auto;/);
  assert.doesNotMatch(image, /object-fit:\s*(?:fill|cover);/);
  assert.match(
    image,
    /box-shadow:\s*inset\s+0\s+0\s+10px\s+rgba\(229,\s*179,\s*77,\s*\.10\);/,
  );
});
