import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");
const assetRatios = [370 / 450, 376 / 458, 386 / 496, 386 / 496, 378 / 456];

function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(escaped + "\\s*\\{([^}]*)\\}", "s"))?.[1] ?? "";
}

test("five homepage feature cards preserve their artwork ratios with a visible 4px gap", () => {
  const root = ruleBody(".home-screen .lottery-screen");
  const row = ruleBody(".home-screen .home-shortcut-row");
  const button = ruleBody(".home-screen .home-shortcut");
  const image = ruleBody(".home-screen .home-shortcut img");
  const bottomGroup = ruleBody(".home-screen .home-bottom-group");

  assert.match(root, /--home-feature-gap:\s*4px;/);
  assert.match(bottomGroup, /grid-template-rows:\s*auto auto;/);
  assert.match(row, /height:\s*auto;/);
  assert.match(row, /aspect-ratio:\s*auto;/);
  assert.match(button, /height:\s*auto;/);
  assert.match(image, /width:\s*100%;/);
  assert.match(image, /height:\s*auto;/);
  assert.doesNotMatch(image, /object-fit:\s*(?:fill|cover);/);

  const tracks = row.match(/grid-template-columns:\s*([^;]+);/)?.[1]
    .trim()
    .split(/\s+/)
    .map((track) => Number.parseFloat(track));
  assert.equal(tracks?.length, 5);

  for (const viewport of [360, 375, 390]) {
    const rowWidth = viewport - 24 - 8;
    const availableWidth = rowWidth - 4 * 4;
    const weightTotal = tracks.reduce((sum, track) => sum + track, 0);
    const renderedHeights = tracks.map((track, index) =>
      (availableWidth * track / weightTotal) / assetRatios[index]
    );
    assert.ok(
      Math.max(...renderedHeights) - Math.min(...renderedHeights) < 0.02,
      `feature cards must keep one aligned height at \${viewport}px`,
    );
  }
});
