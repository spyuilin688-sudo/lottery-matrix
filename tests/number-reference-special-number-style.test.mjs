import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("號碼對照單特別號使用白色正常字重與指定紅色內框", () => {
  const css = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
  const rule = css.match(/\.reference-row button\[data-special="true"\]\s*\{([^}]*)\}/s)?.[1] ?? "";

  assert.match(rule, /color:\s*#fff(?:fff)?\s*;/i);
  assert.match(rule, /font-weight:\s*400\s*;/);
  assert.match(rule, /text-shadow:\s*none\s*;/);
  assert.doesNotMatch(rule, /border\s*:/);

  const innerFrame = css.match(/\.reference-row button\[data-special="true"\]::after\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.match(innerFrame, /inset:\s*0\.3px\s*;/);
  assert.match(innerFrame, /border:\s*1px\s+solid\s+#C65353\s*;/i);
  assert.match(innerFrame, /border-radius:\s*inherit\s*;/);
});
