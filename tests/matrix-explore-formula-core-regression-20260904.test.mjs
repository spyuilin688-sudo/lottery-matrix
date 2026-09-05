import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const featurePages = readFeaturePagesSource();
const previewCss = readFileSync(new URL("../src/explore-result-preview.css", import.meta.url), "utf8");

const processSource = featurePages.match(
  /function ExploreValidationProcess\([\s\S]*?\n}\n\nexport function TianyanValidationProcess/,
)?.[0] ?? "";

test("Matrix Explore restores PR #259 formula computation and exact rule resolution", () => {
  assert.match(processSource, /const lotteryMaximum = lottery === "今彩539" \|\| lottery === "天天樂" \? 39 : 49;/);
  assert.match(processSource, /const normalizeFormulaNumber = \(value: number\) => String\(/);
  assert.match(processSource, /const formulaResultNumber = \(algorithmType: string, baseNumber: number, ruleValue: number\)/);
  assert.match(processSource, /algorithmType\.startsWith\("合值"\) \? ruleValue - baseNumber : baseNumber \+ ruleValue/);
  assert.match(processSource, /const formulaRules = \(matchedRules\?/);
  assert.match(processSource, /rule\.value === matched\.value && rule\.algorithmType === matched\.algorithmType/);
  assert.match(processSource, /item\.algorithmType === "拖牌" \? \[\.\.\.resolved\]\.reverse\(\) : resolved/);
});

test("Matrix Explore formula RHS comes from the formula calculation, not hit or prediction numbers", () => {
  assert.match(processSource, /const validationFormula = \(\s*position: number,\s*baseNumber: number,\s*algorithmType: string,\s*ruleValue: number,/s);
  assert.match(processSource, /formulaResultNumber\(algorithmType, baseNumber, ruleValue\)/);
  assert.match(processSource, /const formulaRows = \(\s*baseNumber: number,\s*matchedRules\?/s);
  assert.doesNotMatch(processSource, /const formulaRows = \(\s*baseNumber: number,\s*resultNumbers: string,/s);
  assert.doesNotMatch(processSource, /formulaRows\(row\.baseNumber, resultNumbers, row\.matchedRules\)/);
  assert.doesNotMatch(processSource, /formulaRows\(validation\.sourceA\.baseNumber, values\(ruleSet\.predictionNumbers\)/);
});

test("Matrix Explore keeps the approved post-#259 UI refinements while restoring the core", () => {
  assert.match(processSource, /className="explore-validation-formula-position"[\s\S]*?<span>第<\/span>[\s\S]*?<span>\{position\}<\/span>[\s\S]*?<span>顆<\/span>/);
  assert.match(processSource, /className="explore-validation-special-separator" aria-hidden="true">\+<\/i>/);
  assert.doesNotMatch(processSource, /\{\" \+\"\}/);

  assert.match(previewCss, /\.explore-validation-number--source,\s*\.explore-validation-number--step,\s*\.explore-validation-number--hit\s*\{[^}]*padding-block:\s*0\.3px;[^}]*padding-inline:\s*0\.7px;[^}]*border-width:\s*0\.7px/s);
  assert.match(previewCss, /\.explore-validation-group\[data-wide-numbers="true"\] \.explore-validation-special-number > \.explore-validation-number\s*\{[^}]*flex-basis:\s*auto/s);
  assert.match(previewCss, /matrix-explore-main-screen:not\(\.matrix-tianyan-screen\) \.explore-validation-card\s*\{[^}]*padding-block:\s*12px/s);
  assert.match(previewCss, /matrix-explore-main-screen:not\(\.matrix-tianyan-screen\) \.explore-validation-formula-position\s*\{[^}]*gap:\s*1px/s);
  assert.match(previewCss, /matrix-explore-main-screen:not\(\.matrix-tianyan-screen\) \.explore-validation-result-number\s*\{[^}]*font-size:\s*calc\(\.8em - 2px\);[^}]*margin-inline:\s*2px/s);
});
