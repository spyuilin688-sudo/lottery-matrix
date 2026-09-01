import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/FeaturePages.tsx", "utf8");
const css = readFileSync("src/feature-pages.css", "utf8");

test("Matrix Explore renders API validation with the merged three-column preview layout", () => {
  const component = source.match(/function ExploreValidationProcess\([\s\S]*?\n}\n\nfunction TianyanValidationProcess/);
  assert.ok(component, "ExploreValidationProcess must exist");

  assert.match(component[0], /className="road-validation-process explore-validation-card"/);
  assert.match(component[0], /className="validation-summary-card explore-validation-summary-card"/);
  assert.match(component[0], /className="explore-validation-groups"/);
  assert.match(component[0], /className="validation-period-block explore-validation-group"/);
  assert.match(component[0], /className="explore-validation-issues"/);
  assert.match(component[0], /className="explore-validation-numbers-card"/);
  assert.match(component[0], /className="explore-validation-formulas"/);
  assert.match(component[0], /className="explore-validation-prediction"/);

  assert.match(css, /\.matrix-explore-main-screen(?::not\(\.explore-result-preview-screen\))? \.explore-validation-group\s*\{[\s\S]*?grid-template-columns:\s*max-content minmax\(0, 1fr\) 110px/s);
  assert.match(css, /\.matrix-explore-main-screen(?::not\(\.explore-result-preview-screen\))? \.explore-validation-summary-card\s*\{[\s\S]*?border:\s*1px solid #e6b76a/s);
});
