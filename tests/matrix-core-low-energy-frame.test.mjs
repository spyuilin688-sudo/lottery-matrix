import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ruleBodies } from "./helpers/css-rules.mjs";

const visual = readFileSync(new URL("../src/homepage/visual-language.css", import.meta.url), "utf8");
const prototype = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");

// Main 246e6ab (2026-09-14) restored circulation/nodes after the earlier 9a177fb frame-only effect.
test("Matrix Core 的環流、八節點與符號動畫沿用同一樣式來源", () => {
  assert.match(visual, /@property --matrix-core-energy-angle\s*\{[^}]*syntax:\s*"<angle>";[^}]*initial-value:\s*0deg;/s);
  assert.match(visual, /\.home-screen \.matrix-core-energy-loop\s*\{[^}]*padding:\s*2px;[^}]*conic-gradient\([^}]*var\(--matrix-core-energy-angle\)[^}]*\)[^}]*animation:\s*matrix-core-energy-circulation 4\.8s linear infinite;/s);
  assert.match(visual, /@keyframes matrix-core-energy-circulation\s*\{[^}]*--matrix-core-energy-angle:\s*360deg;/s);
  assert.match(visual, /\.home-screen \.matrix-core-node\s*\{[^}]*animation:\s*matrix-core-node-pulse 2\.8s ease-in-out infinite;/s);
  assert.match(visual, /\.home-screen \.matrix-core-energy-path\s*\{[^}]*animation:\s*matrix-core-symbol-circulation 4\.8s linear infinite;/s);
  assert.equal((prototype.match(/className="matrix-core-node"/g) ?? []).length, 8);
  assert.equal((visual.match(/\.matrix-core-node:nth-child\([1-8]\)/g) ?? []).length, 8);
  assert.match(visual, /\.matrix-core-symbol-energy\s*\{[^}]*pointer-events:\s*none;/s);
  assert.doesNotMatch(visual, /\.home-screen \.matrix-core-banner(?:::(?:before|after))?\s*\{/);
  assert.doesNotMatch(visual, /matrix-core-frame-angle|!important/);
});

test("Matrix Core reduced-motion 停止所有動畫並保留靜態節點", () => {
  const mediaStart = visual.indexOf("@media (prefers-reduced-motion: reduce)");
  assert.notEqual(mediaStart, -1);
  const reduced = visual.slice(mediaStart);
  for (const name of ["energy-loop", "node", "energy-path"]) {
    const declarations = ruleBodies(reduced, new RegExp(`^\\.home-screen \\.matrix-core-${name}$`)).join("\n");
    assert.match(declarations, /animation:\s*none;/, `${name} must stop animating`);
    if (name === "node") {
      assert.match(declarations, /opacity:\s*\.62;/);
      assert.match(declarations, /transform:\s*translate\(-50%, -50%\) scale\(1\);/);
    } else {
      assert.match(declarations, /opacity:\s*0;/, `${name} must be hidden`);
    }
  }
});
