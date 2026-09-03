import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("src/explore-result-preview.css", "utf8");

test("wide 6+1 special validation number lets content determine flex basis", () => {
  assert.match(
    css,
    /\.explore-validation-group\[data-wide-numbers="true"\]\s+\.explore-validation-special-number\s*>\s*\.explore-validation-number\s*\{[^}]*flex-basis:\s*auto/s,
  );
});
