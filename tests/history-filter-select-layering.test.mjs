import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

test("歷史篩選第二列下拉框沿用共用圓角細框與深色表面，無裝飾疊層", async () => {
  const css = await readFile(new URL("../src/feature-pages.css", import.meta.url), "utf8");

  const shared = ruleBodies(css, /^\.select-box$/);
  assert.equal(shared.length, 1);
  assert.match(shared[0], /border:\s*1px solid var\(--pwa-frame-tertiary\);/);
  assert.match(shared[0], /border-radius:\s*var\(--pwa-frame-radius\);/);
  assert.match(shared[0], /background:\s*var\(--pwa-control-surface\);/);
  const selectBodies = ruleBodies(css, /^\.history-filter-secondary-row \.select-box$/);
  assert.equal(selectBodies.length, 1);
  assert.match(selectBodies[0], /background:\s*var\(--pwa-control-surface\);/);
  assert.doesNotMatch(selectBodies[0], /border(?:-radius)?:/);

  assert.equal(ruleBodies(css, /\.select-box::(?:before|after)$/).length, 0);
});
