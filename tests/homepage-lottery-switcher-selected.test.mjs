import assert from "node:assert/strict";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");

test("首頁彩種選取狀態只畫 0.7px SVG 八角框，不覆蓋底圖內容", () => {
  assert.doesNotMatch(
    css,
    /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{[^}]*background\s*:/s,
  );
  assert.match(
    css,
    /\.lottery-card\[data-selected="true"\]::after\s*\{[^}]*display:\s*none;/s,
  );
  assert.match(
    css,
    /\.lottery-selected-frame-path\s*\{[^}]*fill:\s*none;[^}]*stroke:\s*url\("#lottery-selected-gradient"\);[^}]*stroke-width:\s*\.7px;[^}]*vector-effect:\s*non-scaling-stroke;/s,
  );
  assert.doesNotMatch(css, /\.lottery-card\[data-selected="true"\]::before\s*\{[^}]*-webkit-mask:/s);
  assert.match(
    css,
    /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{[^}]*border-color\s*:\s*transparent;[^}]*border-image\s*:\s*none;/s,
  );
});
