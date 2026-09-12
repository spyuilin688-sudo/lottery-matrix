import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("號碼對照單在 canonical responsive cascade 保留 sticky 定位 [header migration]", () => {
  const css = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
  assert.match(css, /\.sticky-title-card-screen > \.product-header,\s*\.number-reference-screen > \.product-header\s*\{[^}]*position:\s*sticky;[^}]*z-index:\s*30;[^}]*top:\s*0;/s);
});

