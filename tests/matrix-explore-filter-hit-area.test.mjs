import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("src/matrix-explore-spacing.css", "utf8");

test("Matrix Explore consecutive filter hit area stays anchored to its button", () => {
  const match = css.match(/\.matrix-explore-main-screen \.consecutive-filter-button,[\s\S]*?\.matrix-explore-main-screen \.repeat-stats-heading button\s*\{([^}]*)\}/s);
  assert.ok(match, "Missing Matrix Explore filter button rule");
  assert.match(match[1], /position:\s*relative/);
});
