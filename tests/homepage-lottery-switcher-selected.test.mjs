import assert from "node:assert/strict";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");

test("首頁彩種使用 1px 低亮度圓角框並以Logo 透明度與淡金底表示選取", () => {
  assert.match(css, /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\s*\{[^}]*border:\s*1px solid color-mix\(in srgb, var\(--home-frame-gold\) 22%, transparent\);[^}]*border-radius:\s*var\(--home-frame-radius\);[^}]*background:\s*var\(--lottery-neutral-950\);/s);
  assert.match(css, /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{[^}]*border-color:\s*color-mix\(in srgb, var\(--home-frame-bright\) 55%, transparent\);[^}]*background:\s*color-mix\(in srgb, var\(--home-frame-gold\) 6%, var\(--lottery-neutral-950\)\);/s);
  // DESIGN.md compact Selector; later selected-frame refinement is covered by pwa-frame-system.
  assert.match(css, /\.lottery-selector-logo\s*\{[^}]*opacity:\s*\.6;/s);
  assert.match(css, /\.lottery-card\[data-selected="true"\] \.lottery-selector-logo\s*\{[^}]*opacity:\s*1;/s);
  assert.doesNotMatch(css, /\.lottery-card(?:\[data-selected="true"\])?::(?:before|after)\s*\{/);
});
