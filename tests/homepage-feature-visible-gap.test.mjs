import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");
function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(escaped + "\\s*\\{([^}]*)\\}", "s"))?.[1] ?? "";
}

test("four homepage feature cards share the Core inset and retain visible gaps", () => {
  const layout = ruleBody(".home-screen .home-layout");
  const row = ruleBody(".home-screen .home-shortcut-row");
  const button = ruleBody(".home-screen .home-shortcut");
  const image = ruleBody(".home-screen .home-shortcut img");

  assert.match(row, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(layout, /--home-feature-inline:\s*16px;/);
  assert.match(layout, /--home-feature-gap:\s*6px;/);
  assert.match(row, /width:\s*calc\(100% - var\(--home-feature-inline\) \* 2\);/);
  assert.match(row, /gap:\s*var\(--home-feature-gap\);/);
  assert.match(button, /width:\s*100%;/);
  assert.match(button, /(?:^|\n)\s*height:\s*90px;/);
  assert.doesNotMatch(button, /aspect-ratio:/);
  assert.doesNotMatch(css, /--home-feature-card-aspect/);
  assert.match(button, /border:\s*4px solid transparent;/);
  assert.match(button, /min-height:\s*90px;/);
  assert.match(image, /width:\s*100%;/);
  assert.match(image, /height:\s*100%;/);
  assert.match(image, /object-fit:\s*contain;/);
});
