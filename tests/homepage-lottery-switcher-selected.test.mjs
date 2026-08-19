import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../src/homepage-repair.css", import.meta.url), "utf8");

test("首頁彩種選取狀態只畫邊框，不覆蓋底圖內容", () => {
  assert.doesNotMatch(
    css,
    /\.home-screen \.lottery-switcher > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{[^}]*background\s*:/s,
  );
  assert.match(
    css,
    /\.home-screen \.lottery-switcher > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{[^}]*border-color\s*:\s*transparent;[^}]*border-image\s*:\s*var\(--lottery-selected-gradient\) 1;/s,
  );
});
