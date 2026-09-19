import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const baseCss=fs.readFileSync(new URL("../src/homepage/base.css",import.meta.url),"utf8");
const switcherCss=fs.readFileSync(new URL("../src/homepage/lottery-switcher.css",import.meta.url),"utf8");
const visualCss=fs.readFileSync(new URL("../src/homepage/visual-language.css",import.meta.url),"utf8");
const featureSource=readFeaturePagesSource();
test("homepage lottery switcher owns one 16px outer inset without inner compensation",()=>{assert.match(switcherCss,/\.lottery-switcher--home-style\s*\{[^}]*width:\s*calc\(100% - 32px\);[^}]*padding:\s*0;/s);assert.doesNotMatch(baseCss,/\.lottery-switcher--home-style\s*\{[^}]*padding-inline:/s);});
test("unselected lottery dims its logo while selected lottery restores opacity", () => {
  assert.match(switcherCss, /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\s*\{[^}]*border:\s*1px solid color-mix\(in srgb, var\(--home-frame-gold\) 22%, transparent\);[^}]*border-radius:\s*var\(--home-frame-radius\);[^}]*background:\s*var\(--lottery-neutral-950\);/s);
  assert.match(switcherCss, /\.lottery-card\[data-selected="true"\]\s*\{[^}]*border-color:\s*color-mix\(in srgb, var\(--home-frame-bright\) 55%, transparent\);[^}]*background:\s*color-mix\(in srgb, var\(--home-frame-gold\) 6%, var\(--lottery-neutral-950\)\);/s);
  assert.match(switcherCss, /\.lottery-selector-logo\s*\{[^}]*opacity:\s*\.6;/s);
  assert.match(switcherCss, /\.lottery-card\[data-selected="true"\] \.lottery-selector-logo\s*\{[^}]*opacity:\s*1;/s);
  assert.doesNotMatch(switcherCss, /\.lottery-card(?:\[data-selected="true"\])?::(?:before|after)\s*\{/);
});
test("latest draw card renders one bright-gold rounded frame",()=>{assert.match(baseCss,/\.home-screen \.latest-draw-card\s*\{[^}]*border-radius:\s*var\(--home-frame-radius\);[^}]*box-shadow:\s*inset 0 0 0 1px var\(--home-frame-bright\);/s);assert.doesNotMatch(visualCss,/\.home-screen \.latest-draw-card::after\s*\{/s);});
test("custom status tabs keep shared insets and use rounded frames",()=>{assert.match(switcherCss,/\.matrix-custom-status-screen \.custom-status-tabs\s*\{[^}]*padding-inline:\s*4px;[^}]*gap:\s*6px;/s);assert.match(switcherCss,/\.matrix-custom-status-screen \.custom-status-tabs > button::after\s*\{[^}]*border-radius:\s*5px;/s);});
test("profile legal copy does not expose the internal payment-provider note",()=>assert.doesNotMatch(featureSource,/實際金流服務商尚未確認/));
