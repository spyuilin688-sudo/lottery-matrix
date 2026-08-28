import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");
function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(escaped + "\\s*\\{([^}]*)\\}", "s"))?.[1] ?? "";
}

test("five homepage feature cards keep 10px outer margins and responsive 2–3px gaps", () => {
  const layout = ruleBody(".home-screen .home-layout");
  const row = ruleBody(".home-screen .home-shortcut-row");
  const button = ruleBody(".home-screen .home-shortcut");
  const image = ruleBody(".home-screen .home-shortcut img");

  assert.match(row, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(layout, /--home-feature-inline:\s*10px;/);
  assert.match(layout, /--home-feature-gap:\s*clamp\(2px,\s*\.77vw,\s*3px\);/);
  assert.match(row, /width:\s*100%;/);
  assert.match(row, /padding-inline:\s*var\(--home-feature-inline\);/);
  assert.match(row, /column-gap:\s*var\(--home-feature-gap\);/);
  assert.match(button, /width:\s*100%;/);
  assert.match(button, /justify-self:\s*center;/);
  assert.match(button, /aspect-ratio:\s*var\(--home-feature-card-aspect\);/);
  assert.match(button, /border:\s*0;/);
  assert.match(button, /box-shadow:\s*var\(--home-frame-shadow\);/);
  assert.match(button, /overflow:\s*visible;/);
  assert.match(image, /width:\s*100%;/);
  assert.match(image, /height:\s*100%;/);
  assert.match(image, /object-fit:\s*fill;/);
  assert.match(image, /border:\s*0;/);
  assert.match(image, /border-radius:\s*0;/);
});
