import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/feature-pages.css", "utf8");
const formalStart = "/* Matrix Explore formal layout rules */";
const formalEnd = "/* v55 scoped density and hierarchy refinements */";
const formalStartIndex = css.indexOf(formalStart);
const formalEndIndex = css.indexOf(formalEnd);

assert.notEqual(formalStartIndex, -1, "Matrix Explore formal rule block must exist");
assert.notEqual(formalEndIndex, -1, "Matrix Explore formal rule block must have an end marker");
const formal = css.slice(formalStartIndex, formalEndIndex);

test("Matrix Explore keeps one canonical formal layout source", () => {
  assert.equal(css.split(formalStart).length - 1, 1);
  assert.equal(formal.match(/\.matrix-explore-screen \.section-title\s*\{/g)?.length ?? 0, 1);
  assert.equal(formal.match(/\.matrix-explore-screen \.primary-action\s*\{/g)?.length ?? 0, 1);
  assert.doesNotMatch(css, /\.result-summary > div\s*\{\s*min-height:\s*46px;/s);
  assert.doesNotMatch(css, /\.repeat-stats-heading button\s*\{\s*min-height:\s*22px;/s);
});

test("Matrix Explore cards and section titles match the document dimensions", () => {
  assert.match(formal, /\.matrix-explore-screen \.panel\s*\{[^}]*border:\s*1px solid rgba\(108,\s*74,\s*32,\s*\.50\);[^}]*border-radius:\s*12px;[^}]*box-shadow:\s*none;/s);
  assert.match(formal, /\.matrix-explore-screen \.explore-settings,[\s\S]*?width:\s*366px;[\s\S]*?height:\s*auto;[\s\S]*?padding:\s*12px;/s);
  assert.match(formal, /\.matrix-explore-screen \.section-title\s*\{[^}]*min-height:\s*28px;[^}]*gap:\s*10px;[^}]*font-size:\s*19px;[^}]*font-weight:\s*700;[^}]*line-height:\s*26px;/s);
  assert.match(formal, /\.matrix-explore-screen \.section-title > span\s*\{[^}]*width:\s*4px;[^}]*height:\s*24px;[^}]*border-radius:\s*2px;/s);
});

test("Matrix Explore settings use the fixed 32 70 222 mobile grid", () => {
  assert.match(formal, /\.matrix-explore-screen \.setting-grid label,[\s\S]*?min-height:\s*44px;[\s\S]*?grid-template-columns:\s*110px minmax\(0,\s*222px\);[\s\S]*?gap:\s*8px;/s);
  assert.match(formal, /\.matrix-explore-screen \.setting-grid label > span,[\s\S]*?grid-template-columns:\s*32px 70px;[\s\S]*?gap:\s*8px;/s);
  assert.match(formal, /font-size:\s*16px;[\s\S]*?font-weight:\s*600;[\s\S]*?line-height:\s*22px;/s);
  assert.match(formal, /\.matrix-explore-screen \.setting-grid \.select-box,[\s\S]*?width:\s*222px;[\s\S]*?height:\s*44px;/s);
  assert.match(formal, /\.matrix-explore-screen \.native-select select\s*\{[^}]*padding-inline:\s*36px;/s);
  assert.match(formal, /\.matrix-explore-screen \.setting-grid \.native-select svg,[^}]*right:\s*12px;[^}]*width:\s*14px;[^}]*height:\s*14px;/s);
});

test("Matrix Explore option buttons and badges keep stable selected geometry", () => {
  assert.match(formal, /\.matrix-explore-screen \.segmented\.three\s*\{[^}]*gap:\s*6px;/s);
  assert.match(formal, /\.matrix-explore-screen \.segmented\.three button\s*\{[^}]*height:\s*44px;[^}]*font-size:\s*13px;[^}]*font-weight:\s*600;[^}]*white-space:\s*nowrap;/s);
  assert.match(formal, /\.matrix-explore-screen \.segmented\.two,[^}]*gap:\s*8px;/s);
  assert.match(formal, /\.matrix-explore-screen \.segmented\.two button,[^}]*height:\s*44px;[^}]*font-size:\s*15px;[^}]*font-weight:\s*700;/s);
  assert.match(formal, /button\[data-selected="true"\][^}]*border:\s*1px solid #d4a52f;[^}]*background:\s*rgba\(212,\s*165,\s*47,\s*\.10\);[^}]*box-shadow:\s*0 0 3px rgba\(212,\s*165,\s*47,\s*\.16\);/s);
  assert.match(formal, /\.matrix-explore-screen \.segmented button em\s*\{[^}]*top:\s*-7px;[^}]*right:\s*4px;[^}]*height:\s*16px;[^}]*padding:\s*0 5px;[^}]*border-radius:\s*8px;[^}]*font-size:\s*9px;/s);
  assert.match(formal, /\.matrix-explore-screen \.segmented\s*\{[^}]*overflow:\s*visible;/s);
});

test("Matrix Explore advanced row and primary action use document sizing", () => {
  assert.match(formal, /\.matrix-explore-screen \.advanced-row\s*\{[^}]*height:\s*44px;[^}]*min-height:\s*44px;[^}]*grid-template-columns:\s*32px minmax\(0,\s*1fr\) 14px;[^}]*font-size:\s*17px;[^}]*font-weight:\s*700;/s);
  assert.match(formal, /\.matrix-explore-screen \.advanced-panel\s*\{[^}]*padding-top:\s*8px;[^}]*gap:\s*8px;/s);
  assert.match(formal, /\.matrix-explore-screen \.primary-action\s*\{[^}]*width:\s*366px;[^}]*height:\s*50px;[^}]*margin:\s*12px 0;[^}]*border-radius:\s*12px;[^}]*font-size:\s*21px;[^}]*font-weight:\s*700;/s);
  assert.match(formal, /\.matrix-explore-screen \.primary-action svg\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/s);
});

test("Matrix Explore statistics and result heading follow the two-row mobile hierarchy", () => {
  assert.match(formal, /\.matrix-explore-screen \.repeat-stats-heading\s*\{[^}]*grid-template-columns:\s*auto auto minmax\(0,\s*1fr\);[^}]*gap:\s*12px;/s);
  assert.match(formal, /\.matrix-explore-screen \.result-summary\s*\{[^}]*margin-top:\s*12px;[^}]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\);[^}]*gap:\s*6px;/s);
  assert.match(formal, /\.matrix-explore-screen \.result-summary > div\s*\{[^}]*height:\s*48px;[^}]*border-radius:\s*8px;/s);
  assert.match(formal, /\.matrix-explore-screen \.explore-result-disclaimer\s*\{[^}]*padding:\s*14px 12px;[^}]*font-size:\s*13px;[^}]*line-height:\s*1\.55;[^}]*text-align:\s*center;/s);
  assert.match(formal, /\.matrix-explore-screen \.result-title\s*\{[^}]*grid-template-columns:\s*auto auto minmax\(0,\s*1fr\);[^}]*row-gap:\s*6px;/s);
  assert.match(formal, /\.matrix-explore-screen \.result-count\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*justify-self:\s*end;[^}]*font-size:\s*13px;/s);
  assert.match(formal, /\.matrix-explore-screen \.result-count \.numeric-text\s*\{[^}]*font-size:\s*17px;[^}]*font-weight:\s*700;/s);
  assert.match(formal, /\.matrix-explore-screen \.result-panel\s*\{[^}]*padding-top:\s*12px;/s);
});
