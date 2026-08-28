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
  const selectedFrame = css.match(/\.lottery-card\[data-selected="true"\]::before\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.match(selectedFrame, /--matrix-selected-frame-width:\s*\.7px;/);
  assert.match(selectedFrame, /inset:\s*\.5px;/);
  assert.doesNotMatch(selectedFrame, /clip-path/);
  assert.match(selectedFrame, /var\(--lottery-selected-horizontal-gradient\)/);
  assert.match(selectedFrame, /var\(--lottery-selected-left-edge\)/);
  assert.match(selectedFrame, /var\(--lottery-selected-right-edge\)/);
  assert.doesNotMatch(selectedFrame, /(?:-webkit-)?mask|mask-composite/);
  assert.match(
    css,
    /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{[^}]*border-color\s*:\s*transparent;[^}]*border-image\s*:\s*none;/s,
  );
});
