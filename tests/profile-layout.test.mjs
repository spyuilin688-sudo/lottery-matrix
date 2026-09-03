import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source = readFileSync("src/FeaturePages.tsx", "utf8");
test("integration restored the canonical Explore formula core", () => {
  assert.match(source, /const formulaResultNumber = \(algorithmType: string, baseNumber: number, ruleValue: number\)/);
  assert.match(source, /const formulaRules = \(matchedRules\?/);
  assert.match(source, /item\.algorithmType === "拖牌" \? \[\.\.\.resolved\]\.reverse\(\) : resolved/);
});
