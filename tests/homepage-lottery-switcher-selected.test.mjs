import assert from "node:assert/strict";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");

test("首頁彩種選取狀態只畫邊框，不覆蓋底圖內容", () => {
  assert.doesNotMatch(
    css,
    /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{[^}]*background\s*:/s,
  );
  assert.match(
    css,
    /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]::after\s*\{[^}]*inset\s*:\s*0;[^}]*padding\s*:\s*1px;[^}]*border-radius\s*:\s*inherit;[^}]*background\s*:\s*var\(--lottery-selected-gradient\);[^}]*mask-composite\s*:\s*exclude;/s,
  );
  assert.match(
    css,
    /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{[^}]*border-color\s*:\s*transparent;[^}]*border-image\s*:\s*none;/s,
  );
});
