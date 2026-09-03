import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/FeaturePages.tsx", "utf8");

test("RED guard: Explore formula core must be restored by the integration runner", () => {
  assert.match(source, /const formulaResultNumber = \(algorithmType: string, baseNumber: number, ruleValue: number\)/);
  assert.match(source, /const formulaRules = \(matchedRules\?/);
});
