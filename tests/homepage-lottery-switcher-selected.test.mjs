import assert from "node:assert/strict";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");

test("首頁彩種選取狀態只畫 0.7px 等厚八角框，不覆蓋底圖內容", () => {
  assert.doesNotMatch(
    css,
    /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{[^}]*background\s*:/s,
  );
  assert.match(
    css,
    /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]::before\s*\{[^}]*--matrix-selected-frame-width\s*:\s*\.7px;[^}]*inset\s*:\s*\.5px;[^}]*background\s*:\s*var\(--lottery-selected-gradient\);[^}]*-webkit-mask\s*:/s,
  );
  const selectedFrame = css.match(/\.lottery-card\[data-selected="true"\]::before\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.match(selectedFrame, /linear-gradient\(135deg,/);
  assert.match(selectedFrame, /linear-gradient\(45deg,/);
  assert.doesNotMatch(selectedFrame, /content-box|mask-composite/);
  assert.match(
    css,
    /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{[^}]*border-color\s*:\s*transparent;[^}]*border-image\s*:\s*none;/s,
  );
});
