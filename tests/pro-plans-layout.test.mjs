import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

const css = readFileSync("src/pro-plans-layout.css", "utf8");

function ruleBlock(selectorPattern) {
  const bodies = ruleBodies(css, new RegExp(`^(?:${selectorPattern})$`, "s"));
  assert.ok(bodies.length > 0, `Expected a rule block for ${selectorPattern}`);
  return bodies[0];
}

test("Pro plan page keeps independent 15px plan and 16px checkout gutters", () => {
  const screen = ruleBlock("\\.pro-plans-screen");
  const planCard = ruleBlock("\\.pro-plans-screen \\.plan-card");
  const checkout = ruleBlock("\\.pro-plans-screen \\.pro-plans-checkout");

  assert.match(screen, /--pro-plans-plan-inline:\s*15px/);
  assert.match(screen, /--pro-plans-checkout-inline:\s*16px/);
  assert.match(planCard, /flex:\s*0 0 calc\(100% - \(var\(--pro-plans-plan-inline\) \* 2\)\)/);
  assert.match(checkout, /margin-inline:\s*var\(--pro-plans-checkout-inline\)/);

  assert.doesNotMatch(css, /--pro-plans-inline\s*:/);
  assert.doesNotMatch(css, /--pro-plans-inline:\s*18px/);
});

test("renewal card and confirm-payment share the 16px checkout gutter without separate horizontal offsets", () => {
  const renewal = ruleBlock("\\.pro-plans-screen \\.renewal-card");
  const payment = ruleBlock("\\.pro-plans-screen \\.confirm-payment\\.branded-explore-action");

  assert.doesNotMatch(renewal, /margin-inline\s*:/);
  assert.doesNotMatch(payment, /margin-inline\s*:/);
});
