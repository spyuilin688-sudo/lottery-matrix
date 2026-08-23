import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const baseCss = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");

test("Matrix Core keeps 16px side spacing, trims 6px from the bottom, and fills its container", () => {
  assert.match(baseCss, /--home-core-width:\s*calc\(min\(100vw, 390px\) - 32px\);/);
  assert.match(baseCss, /--home-core-height:\s*calc\(\(var\(--home-core-width\) \* 414 \/ 1536\) - 6px\);/);
  assert.match(baseCss, /\.home-screen \.matrix-core-banner\s*\{[\s\S]*?width:\s*var\(--home-core-width\);[\s\S]*?height:\s*var\(--home-core-height\);/);
  assert.match(baseCss, /\.home-screen \.matrix-core-banner > \.home-asset-image\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;[\s\S]*?object-fit:\s*fill;/);
});

test("selected lottery frame follows the artwork corner radius without square border-image corners", () => {
  assert.match(baseCss, /\.lottery-card\[data-selected="true"\]\s*\{[\s\S]*?border-radius:\s*12px;[\s\S]*?border-image:\s*none;/);
  assert.match(baseCss, /\.lottery-card\[data-selected="true"\]::after\s*\{[\s\S]*?display:\s*block;[\s\S]*?inset:\s*0;[\s\S]*?padding:\s*1px;[\s\S]*?border-radius:\s*inherit;[\s\S]*?background:\s*var\(--lottery-selected-gradient\);[\s\S]*?mask-composite:\s*exclude;/);
});

test("latest draw artwork continues to fill the whole card container", () => {
  assert.match(baseCss, /\.home-screen \.latest-draw-card\s*\{[\s\S]*?background:\s*url\("\/assets\/lottery\/functions\/開獎資訊卡\.png"\) center \/ 100% 100% no-repeat;/);
});
