import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync("src/matrix-explore-spacing.css", "utf8");
const prototype = readFileSync("src/prototype.css", "utf8");

test("Matrix Explore lower result sections match reference image two", () => {
  assert.match(
    layout,
    /\.matrix-explore-main-screen \.repeat-stats-panel,\s*\.matrix-explore-main-screen \.result-panel\s*\{[^}]*padding:\s*\.75rem;/s,
  );
  assert.match(
    layout,
    /\.matrix-explore-main-screen \.explore-result-disclaimer\s*\{[^}]*font-size:\s*clamp\(\.5rem, 2\.2vw, \.5625rem\);[^}]*white-space:\s*nowrap;/s,
  );
  assert.match(
    layout,
    /\.matrix-explore-main-screen \.result-title\s*\{[^}]*flex-wrap:\s*nowrap;/s,
  );
  assert.match(
    layout,
    /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1\.08fr\) minmax\(0, 1\.23fr\) minmax\(0, 1\.46fr\) minmax\(0, 1\.46fr\) minmax\(0, 1\.46fr\);/s,
  );
  assert.match(
    layout,
    /\.matrix-explore-main-screen \.road-result-row\s*\{[^}]*min-height:\s*46px;[^}]*border-bottom:\s*1px solid rgba\(90, 87, 80, \.7\);/s,
  );
  assert.match(
    layout,
    /\.matrix-explore-main-screen \.consecutive-filter-button,\s*\.matrix-explore-main-screen \.repeat-stats-heading button\s*\{[^}]*border:\s*1px solid rgba\(212, 165, 47, \.72\);[^}]*background:\s*transparent;[^}]*color:\s*#d8a93e;/s,
  );
  assert.match(
    layout,
    /\.matrix-explore-main-screen \.road-type-toggle svg\s*\{[^}]*width:\s*\.5rem;[^}]*height:\s*\.5rem;[^}]*flex:\s*0 0 \.5rem;/s,
  );
});

test("temporary global debug outlines are removed instead of covered", () => {
  assert.doesNotMatch(prototype, /Temporary global container debug outlines/);
  assert.doesNotMatch(prototype, /--debug-container-/);
  assert.doesNotMatch(prototype, /outline:\s*1px solid var\(--debug-container-/);
  assert.doesNotMatch(layout, /!important|zoom\s*:|scale\s*\(|margin(?:-[a-z]+)?\s*:\s*-/);
});

test("the six result columns retain usable proportional width at supported mobile sizes", () => {
  const weights = [1, 1.08, 1.23, 1.46, 1.46, 1.46];
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);

  for (const viewport of [360, 375, 390]) {
    const panelContentWidth = viewport - 32 - 24;
    const typeColumnWidth = panelContentWidth * weights[5] / totalWeight;
    assert.ok(typeColumnWidth >= 57, `${viewport}px leaves too little room for the road type column`);
  }
});
