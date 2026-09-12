import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

test("歷史篩選第二列下拉框保留直角深色表面並停用舊金色圖層", async () => {
  const css = await readFile(new URL("../src/feature-pages.css", import.meta.url), "utf8");

  const selectBodies = ruleBodies(css, /^\.history-filter-secondary-row \.select-box$/);
  assert.ok(selectBodies.some((body) => /border:\s*1px solid #b98723;/.test(body) && /background:\s*#07131d;/.test(body)));

  const afterBodies = ruleBodies(css, /^\.history-filter-secondary-row \.select-box::after$/);
  assert.equal(afterBodies.length, 1);
  assert.match(afterBodies[0], /display:\s*none;/);
});
