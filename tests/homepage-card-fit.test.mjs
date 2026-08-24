import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");
const source = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");

test("Matrix Core uses its 1536:414 token and container background without a child image", () => {
  const component = source.match(/export function MatrixCoreBanner[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(css, /--home-core-width:\s*calc\(min\(100vw, 390px\) - 32px\);/);
  assert.match(css, /--home-core-height:\s*calc\(\(var\(--home-core-width\) \* 414 \/ 1536\) - 6px\);/);
  assert.match(css, /\.home-screen \.matrix-core-banner\s*\{[^}]*width:\s*var\(--home-core-width\);[^}]*height:\s*var\(--home-core-height\);[^}]*background:\s*url\("\/assets\/lottery\/functions\/matrixcore\.png"\) center \/ 100% 100% no-repeat;/s);
  assert.match(component, /return <button[^>]*className="matrix-core-banner home-core-box"[^>]*\/>;/);
  assert.doesNotMatch(component, /<img\b/);
});

test("selected lottery frame follows the artwork corner radius without square border-image corners", () => {
  const selectedRule = css.match(/\.home-screen \.lottery-switcher > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{([\s\S]*?)\}/)?.[1];
  const selectedAfterRule = css.match(/\.home-screen \.lottery-switcher > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]::after\s*\{([\s\S]*?)\}/)?.[1];

  assert.ok(selectedRule);
  assert.match(selectedRule, /border-radius:\s*12px;/);
  assert.match(selectedRule, /border-image:\s*none;/);
  assert.ok(selectedAfterRule);
  assert.match(selectedAfterRule, /display:\s*block;/);
  assert.match(selectedAfterRule, /inset:\s*0;/);
  assert.match(selectedAfterRule, /padding:\s*1px;/);
  assert.match(selectedAfterRule, /border-radius:\s*inherit;/);
  assert.match(selectedAfterRule, /background:\s*var\(--lottery-selected-gradient\);/);
  assert.match(selectedAfterRule, /mask-composite:\s*exclude;/);
});

test("latest draw artwork continues to fill the whole card container", () => {
  assert.match(css, /\.home-screen \.latest-draw-card\s*\{[\s\S]*?background:\s*url\("\/assets\/lottery\/functions\/開獎資訊卡\.png"\) center \/ 100% 100% no-repeat;/);
});
