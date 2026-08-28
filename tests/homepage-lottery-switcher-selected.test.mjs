import assert from "node:assert/strict";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");

test("首頁彩種選取狀態只畫 0.7px 內縮邊框，不覆蓋底圖內容", () => {
  assert.doesNotMatch(
    css,
    /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{[^}]*background\s*:/s,
  );
  assert.match(
    css,
    /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]::before\s*\{[^}]*inset\s*:\s*\.5px;[^}]*padding\s*:\s*\.7px;[^}]*background\s*:\s*var\(--lottery-selected-gradient\);[^}]*mask-composite\s*:\s*exclude;/s,
  );
  assert.doesNotMatch(css.match(/\\.lottery-card\\[data-selected="true"\\]::before\\s*\\{([^}]*)\\}/s)?.[1] ?? "", /content-box|mask-composite/);
  assert.match(
    css,
    /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{[^}]*border-color\s*:\s*transparent;[^}]*border-image\s*:\s*none;/s,
  );
});
