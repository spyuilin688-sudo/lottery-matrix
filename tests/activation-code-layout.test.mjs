import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

const css = readFileSync("src/activation-code-layout.css", "utf8");

function ruleBlock(selectorPattern) {
  const bodies = ruleBodies(css, new RegExp(`^(?:${selectorPattern})$`, "s"));
  assert.ok(bodies.length > 0, `Expected a rule block for ${selectorPattern}`);
  return bodies[0];
}

test("activation rule headers are borderless with 4px vertical padding", () => {
  const card = ruleBlock("\\.activation-code-screen \\.referral-rule-card");
  assert.match(card, /border:\s*0/);

  const toggle = ruleBlock("\\.activation-code-screen \\.referral-rule-toggle");
  assert.match(toggle, /padding-block:\s*4px/);
});
