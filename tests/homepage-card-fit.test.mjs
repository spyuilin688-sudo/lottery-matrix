import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");
const source = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");

test("Matrix Core uses its fitted responsive token and container background without a child image", () => {
  const component = source.match(/export function MatrixCoreBanner[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(css, /--home-core-width:\s*calc\(min\(100vw, 390px\) - 28px\);/);
  assert.match(css, /--home-core-height:\s*clamp\(68px,\s*calc\(\(var\(--home-core-width\) \* 414 \/ 1536\) - 18px\),\s*79px\);/);
  assert.match(css, /\.home-screen \.matrix-core-banner\s*\{[^}]*width:\s*var\(--home-core-width\);[^}]*height:\s*var\(--home-core-height\);[^}]*background:\s*url\("\/assets\/lottery\/functions\/matrixcore\.png"\) center \/ cover no-repeat;/s);
  assert.match(component, /className="matrix-core-banner home-core-box"/);
  assert.match(component, /className="matrix-core-symbol-energy"/);
  assert.doesNotMatch(component, /<img\b/);
});

test("selected lottery frame follows both outer and inner octagonal corners", () => {
  const selectedRule = css.match(/\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{([\s\S]*?)\}/)?.[1];
  const selectedBeforeRule = css.match(/\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]::before\s*\{([\s\S]*?)\}/)?.[1];

  assert.ok(selectedRule);
  assert.match(selectedRule, /border-radius:\s*0;/);
  assert.match(selectedRule, /border-image:\s*none;/);
  assert.ok(selectedBeforeRule);
  assert.match(selectedBeforeRule, /display:\s*block;/);
  assert.match(selectedBeforeRule, /--matrix-selected-frame-width:\s*\.7px;/);
  assert.match(selectedBeforeRule, /inset:\s*\.5px;/);
  assert.match(selectedBeforeRule, /background:\s*var\(--lottery-selected-gradient\);/);
  assert.match(selectedBeforeRule, /-webkit-mask:[\s\S]*linear-gradient\(135deg,[\s\S]*linear-gradient\(45deg,/);
  assert.doesNotMatch(selectedBeforeRule, /mask-composite|content-box/);
});

test("latest draw artwork continues to fill the whole card container", () => {
  assert.match(css, /\.home-screen \.latest-draw-card\s*\{[\s\S]*?background:\s*url\("\/assets\/lottery\/functions\/開獎資訊卡\.png"\) center \/ 100% 100% no-repeat;/);
});
