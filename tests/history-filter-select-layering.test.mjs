import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

test("歷史篩選第二列繼承共用細金圓角框與深色表面", async () => {
  const css = await readFile(new URL("../src/feature-pages.css", import.meta.url), "utf8");

  const selectBodies = ruleBodies(css, /^\.history-filter-secondary-row \.select-box$/);
  assert.equal(selectBodies.length, 1);
  assert.match(selectBodies[0], /background:\s*var\(--pwa-control-surface\);/);
  assert.doesNotMatch(selectBodies[0], /border(?:-radius)?:/);
  const shared = ruleBodies(css, /^\.select-box$/);
  assert.equal(shared.length, 1);
  assert.match(shared[0], /border:\s*1px solid var\(--pwa-frame-tertiary\);/);
  assert.match(shared[0], /border-radius:\s*var\(--pwa-frame-radius\);/);
  assert.doesNotMatch(css, /\.select-box::(?:before|after)/);
});
