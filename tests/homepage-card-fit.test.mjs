import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");
const source = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");

test("Matrix Core uses its fitted responsive token and container background without a child image", () => {
  const component = source.match(/export function MatrixCoreBanner[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(css, /--home-core-width:\s*calc\(min\(100vw, 390px\) - 32px\);/);
  assert.match(css, /--home-core-height:\s*calc\(var\(--home-core-width\) \* 181 \/ 654\);/);
  assert.match(css, /\.home-screen \.matrix-core-banner\s*\{[^}]*width:\s*var\(--home-core-width\);[^}]*height:\s*var\(--home-core-height\);[^}]*background:\s*url\("\/assets\/lottery\/home-premium\/core-artwork\.webp"\) center \/ cover no-repeat;/s);
  assert.match(component, /className="matrix-core-banner home-core-box"/);
  assert.match(component, /className="matrix-core-description"/);
  assert.doesNotMatch(component, /<img\b/);
});

test("selected lottery restores artwork brightness inside the single rounded frame", () => {
  const cardRule = css.match(/\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\s*\{([\s\S]*?)\}/)?.[1];
  const selectedRule = css.match(/\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{([\s\S]*?)\}/)?.[1];

  assert.ok(cardRule && selectedRule);
  assert.match(cardRule, /border:\s*1px solid var\(--home-frame-muted\);/);
  assert.match(cardRule, /border-radius:\s*var\(--home-frame-radius\);/);
  assert.match(cardRule, /background-color:\s*rgba\(0, 0, 0, \.4\);/);
  assert.match(cardRule, /background-blend-mode:\s*multiply;/);
  assert.match(selectedRule, /background-color:\s*transparent;/);
  assert.doesNotMatch(css, /\.lottery-card\[data-selected="true"\]::before\s*\{/);
});

test("latest draw uses the canonical rounded bright frame without legacy artwork", () => {
  assert.match(css, /\.home-screen \.latest-draw-card\s*\{[^}]*border-radius:\s*var\(--home-frame-radius\);[^}]*background:\s*linear-gradient\(180deg, #071018, #04090d\);[^}]*box-shadow:\s*inset 0 0 0 1px var\(--home-frame-bright\);/s);
  assert.doesNotMatch(css, /開獎資訊卡\.png/);
});
