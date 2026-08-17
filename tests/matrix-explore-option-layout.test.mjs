import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/feature-pages.css", "utf8");

test("Matrix Explore option grid cannot overflow its mobile column", () => {
  assert.match(
    css,
    /\.setting-grid label,\s*\.advanced-panel label\s*\{[^}]*min-width:\s*0;[^}]*width:\s*100%;[^}]*grid-template-columns:\s*102px minmax\(0, 1fr\);/s,
  );
  assert.doesNotMatch(
    css,
    /\.setting-grid label,\s*\.advanced-panel label\s*\{[^}]*grid-template-columns:\s*102px 1fr;/s,
  );
});

test("native select wrapper and select can shrink inside Matrix Explore grid", () => {
  assert.match(
    css,
    /\.native-select\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*min-width:\s*0;/s,
  );
  assert.match(
    css,
    /\.native-select select\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*min-width:\s*0;/s,
  );
});
