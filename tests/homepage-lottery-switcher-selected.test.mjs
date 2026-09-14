import assert from "node:assert/strict";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");

test("首頁彩種使用 1px 低亮度圓角框並以背景亮度表示選取", () => {
  assert.match(css, /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\s*\{[^}]*border:\s*1px solid var\(--home-frame-muted\);[^}]*border-radius:\s*var\(--home-frame-radius\);[^}]*background-color:\s*rgba\(0, 0, 0, \.4\);[^}]*background-blend-mode:\s*multiply;/s);
  assert.match(css, /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{[^}]*background-color:\s*transparent;/s);
  assert.doesNotMatch(css, /\.lottery-card(?:\[data-selected="true"\])?::(?:before|after)\s*\{/);
});
