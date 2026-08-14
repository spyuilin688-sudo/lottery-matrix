import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("歷史篩選下拉框直接停用金色圖層並使用深色背景", async () => {
  const css = await readFile(new URL("../src/feature-pages.css", import.meta.url), "utf8");

  assert.match(css, /\\.history-filter-sheet \\.select-box\\s*\\{[^}]*border:\\s*1px solid #b98723;[^}]*background:\\s*#07131d;/s);
  assert.match(css, /\\.history-filter-sheet \\.select-box::before,\\s*\\.history-filter-sheet \\.select-box::after\\s*\\{\\s*display:\\s*none;/);
});
