import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/FeaturePages.tsx", "utf8");
const css = readFileSync("src/explore-result-preview.css", "utf8");

test("Matrix Explore renders API validation with the merged three-column preview layout", () => {
  const component = source.match(/function ExploreValidationProcess\([\s\S]*?\n}\n\nfunction TianyanValidationProcess/);
  assert.ok(component, "ExploreValidationProcess must exist");

  assert.match(component[0], /className="road-validation-process explore-validation-card"/);
  assert.match(component[0], /className="explore-validation-summary-card"/);
  assert.match(component[0], /className="explore-validation-groups"/);
  assert.match(component[0], /className="explore-validation-group"/);
  assert.match(component[0], /className="explore-validation-issues explore-validation-numeric-text"/);
  assert.match(component[0], /className="explore-validation-numbers-card"/);
  assert.match(component[0], /className="explore-validation-formulas explore-validation-numeric-text"/);
  assert.match(component[0], /className="explore-validation-prediction"/);

  assert.match(css, /\.explore-validation-group\s*\{[\s\S]*?grid-template-columns:\s*max-content minmax\(0, 1fr\) minmax\(clamp\(92px, 30vw, 120px\), 120px\)/s);
  assert.match(css, /\.explore-validation-summary-card\s*\{[\s\S]*?border:\s*1px solid #e6b76a/s);
});

test("Matrix Explore keeps the requested validation spacing and typography scoped", () => {
  assert.match(css, /--explore-validation-summary-border-color:\s*#e6b76a/);
  assert.match(css, /\.explore-validation-summary\s*\{[^}]*padding:\s*5px 2px 5px 4px/s);
  assert.match(css, /\.explore-validation-summary-separator\s*\{[^}]*color:\s*var\(--explore-validation-summary-border-color\)/s);
  assert.match(css, /\.explore-validation-number\s*\{[^}]*font-size:\s*13px/s);
  assert.match(css, /\.explore-validation-numbers em\s*\{[^}]*font-size:\s*13px/s);
  assert.match(css, /\.explore-validation-group\[data-row-count="3"\] \.explore-validation-formula-row:nth-child\(2\)\s*\{[^}]*color:\s*#e4c980/s);
  assert.match(css, /\.explore-validation-result-number\s*\{[^}]*font-weight:\s*700/s);
  assert.doesNotMatch(css, /!important/);
});
