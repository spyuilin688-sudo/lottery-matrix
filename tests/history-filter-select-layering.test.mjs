import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("歷史篩選下拉框的深色表層固定覆蓋金色邊框層", async () => {
  const css = await readFile(new URL("../src/feature-pages.css", import.meta.url), "utf8");

  assert.match(css, /\\.history-filter-sheet \\.select-box::before\\s*\\{\\s*z-index:\\s*0;/);
  assert.match(css, /\\.history-filter-sheet \\.select-box::after\\s*\\{\\s*z-index:\\s*1;/);
  assert.match(css, /\\.history-filter-sheet \\.native-select :is\\(select, svg\\)\\s*\\{\\s*z-index:\\s*2;/);
});
