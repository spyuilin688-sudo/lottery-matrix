import assert from "node:assert/strict";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");

test("首頁彩種選取狀態只畫 0.7px 響應式八角框，不覆蓋底圖內容", () => {
  assert.doesNotMatch(
    css,
    /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{[^}]*background\s*:/s,
  );
  assert.match(css, /\.lottery-card\[data-selected="true"\]::after\s*\{[^}]*display:\s*none;/s);
  assert.match(
    css,
    /\.lottery-card\[data-selected="true"\]::before\s*\{[^}]*--matrix-selected-frame-width:\s*\.7px;[^}]*inset:\s*\.5px;[^}]*clip-path:\s*inherit;[^}]*background:[^}]*var\(--lottery-selected-horizontal-gradient\)[^}]*var\(--lottery-selected-vertical-gradient\);/s,
  );
  const selectedFrame = css.match(/\.lottery-card\[data-selected="true"\]::before\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.doesNotMatch(selectedFrame, /(?:-webkit-)?mask|mask-composite/);
  assert.match(
    css,
    /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{[^}]*border-color\s*:\s*transparent;[^}]*border-image\s*:\s*none;/s,
  );
});
