import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("號碼對照單在共用覆寫之後保留 sticky 定位", () => {
  const css = readFileSync(new URL("../src/project-overrides.css", import.meta.url), "utf8");

  assert.match(
    css,
    /\.number-reference-screen\s*>\s*\.feature-brand-header\s*\{[^}]*position:\s*sticky\s*!important;[^}]*top:\s*0\s*!important;/s,
  );
});
