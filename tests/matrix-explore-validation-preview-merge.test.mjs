import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/FeaturePages.tsx", "utf8");
const css = readFileSync("src/explore-result-preview.css", "utf8");
const component = source.match(/function ExploreValidationProcess\([\s\S]*?\n}\n\nfunction TianyanValidationProcess/);

test("Matrix Explore renders API validation with the merged three-column preview layout", () => {
  assert.ok(component, "ExploreValidationProcess must exist");

  assert.match(component[0], /className="road-validation-process explore-validation-card"/);
  assert.match(component[0], /className="explore-validation-summary-card"/);
  assert.match(component[0], /className="explore-validation-groups"/);
  assert.match(component[0], /className="explore-validation-group"/);
  assert.match(component[0], /className="explore-validation-issues explore-validation-numeric-text"/);
  assert.match(component[0], /className="explore-validation-numbers-card"/);
  assert.match(component[0], /className="explore-validation-formulas"/);
  assert.match(component[0], /className="explore-validation-prediction"/);
  assert.match(component[0], /data-lottery=\{lottery\}/);
  assert.match(component[0], /data-road-type=\{item\.algorithmType\}/);

  assert.match(css, /\.explore-validation-group\s*\{[\s\S]*?grid-template-columns:\s*max-content minmax\(0, 1fr\) minmax\(clamp\(92px, 30vw, 120px\), 120px\)/s);
  assert.match(css, /\.explore-validation-group:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\)\s*\{[^}]*grid-template-columns:\s*max-content minmax\(0, 1fr\) minmax\(clamp\(88px, 27vw, 108px\), 108px\)/s);
  assert.match(css, /\.explore-validation-group:is\(\[data-lottery="今彩539"\], \[data-lottery="天天樂"\]\)\s*\{[^}]*grid-template-columns:\s*max-content minmax\(0, 1fr\) minmax\(clamp\(100px, 32vw, 128px\), 128px\)/s);
  assert.match(css, /\.explore-validation-summary-card\s*\{[\s\S]*?border:\s*1px solid #e6b76a/s);
});

test("Matrix Explore keeps the requested validation spacing and typography scoped", () => {
  assert.match(css, /--explore-validation-summary-border-color:\s*#e6b76a/);
  assert.match(css, /\.explore-validation-summary\s*\{[^}]*padding:\s*5px 2px 5px 4px/s);
  assert.match(css, /\.explore-validation-summary-separator\s*\{[^}]*color:\s*var\(--explore-validation-summary-border-color\)/s);
  assert.match(css, /\.explore-validation-number\s*\{[^}]*font-size:\s*13px/s);
  assert.match(css, /\.explore-validation-number\s*\{[^}]*padding:\s*0 1px;[^}]*letter-spacing:\s*normal/s);
  assert.match(css, /\.explore-validation-number--source,\s*\.explore-validation-number--step,\s*\.explore-validation-number--hit\s*\{[^}]*height:\s*auto;[^}]*aspect-ratio:\s*auto;[^}]*padding-block:\s*0\.3px;[^}]*padding-inline:\s*1px/s);
  assert.match(css, /\.explore-validation-group\[data-wide-numbers="true"\] \.explore-validation-number--source,\s*\.explore-validation-group\[data-wide-numbers="true"\] \.explore-validation-number--step,\s*\.explore-validation-group\[data-wide-numbers="true"\] \.explore-validation-number--hit\s*\{[^}]*height:\s*auto;[^}]*aspect-ratio:\s*auto/s);
  assert.match(css, /\.explore-validation-numbers em\s*\{[^}]*font-size:\s*13px;[^}]*letter-spacing:\s*-\.06em/s);
  assert.match(css, /\.explore-validation-special-number\s*\{[^}]*margin-left:\s*2\.5px;[^}]*gap:\s*2\.5px/s);
  assert.match(css, /\.explore-validation-formulas\s*\{[^}]*font-family:\s*"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif/s);
  assert.match(css, /\.explore-validation-formula-expression\s*\{[^}]*display:\s*inline-flex;[^}]*gap:\s*2px;[^}]*color:\s*#e4c980/s);
  assert.match(css, /\.explore-validation-group\[data-wide-numbers="true"\] \.explore-validation-numbers\s*\{[^}]*grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\) max-content;/s);
  assert.match(css, /\.explore-validation-result-number\s*\{[^}]*font-size:\s*\.85em;[^}]*font-weight:\s*700;[^}]*line-height:\s*1/s);
  assert.match(component[0], /<>［\{" "\}<strong className="explore-validation-result-number">\{resultNumbers\}<\/strong>\{" "\}］<\/>/);
  assert.match(component[0], /className="explore-validation-formula-expression"/);
  assert.match(component[0], /const formulaRows = \(\s*baseNumber: number,\s*resultNumbers: string,/s);
  assert.match(component[0], /validationFormula\(\s*item\.referencePosition \?\? item\.position,\s*baseNumber,\s*display,\s*resultNumbers,/s);
  assert.match(component[0], /display\.replace\(\/\^\\\+\/, ""\)/);
  assert.doesNotMatch(component[0], /const formulaResultNumber/);
  assert.doesNotMatch(component[0], /className="explore-validation-formulas explore-validation-numeric-text"/);
  assert.doesNotMatch(component[0], /`第\$\{item\.referencePosition \?\? item\.position\}顆 \$\{displayNumber\(row\.baseNumber\)\} \$\{display\} = \$\{resultNumbers\}`/);
  assert.doesNotMatch(component[0], /<span>\{formula\}<\/span>\{" \+"\}/);
  assert.match(css, /\.explore-validation-formula-row:first-child\s*\{[^}]*color:\s*#e4c980/s);
  assert.doesNotMatch(css, /\.explore-validation-group\[data-row-count="3"\] \.explore-validation-formula-row:nth-child\(2\)/);
  assert.doesNotMatch(css, /\.explore-validation-group\[data-road-type="拖牌"\] \.explore-validation-formula-row:nth-child\(2\)/);
  assert.doesNotMatch(css, /!important/);
});