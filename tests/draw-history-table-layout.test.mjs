import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");

test("歷史開獎三欄使用單一正式比例並將前兩欄內容幾何置中", () => {
  assert.match(css, /\.draw-history-row\s*\{[^}]*grid-template-columns:\s*56px 64px minmax\(0, 1fr\)/s);
  assert.match(css, /\.draw-history-row\s*>\s*span\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.draw-history-row\s*>\s*span\s*\{[^}]*padding:\s*0/s);
  assert.match(css, /\.draw-history-row\s*>\s*span\s*\{[^}]*place-items:\s*center/s);
});

test("歷史開獎表格降低分隔線亮度並分開五球與六加一排列", () => {
  assert.match(css, /border-top:\s*1px solid rgba\(111, 82, 39, \.28\)/);
  assert.match(css, /border-left:\s*1px solid rgba\(126, 91, 39, \.38\)/);
  assert.match(css, /\.draw-history-row \.history-numbers:not\(\[data-has-special="true"\]\)[^}]*justify-content:\s*center/s);
  assert.match(css, /\.draw-history-row \.history-numbers\[data-has-special="true"\] \.history-main-numbers[^}]*gap:\s*3px/s);
});
