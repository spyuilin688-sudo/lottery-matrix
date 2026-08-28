import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");
const source = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");

test("Matrix Core 能量沿 M 與圓環的透明路徑運行", () => {
  assert.match(source, /className="matrix-core-symbol-energy"/);
  assert.match(source, /className="matrix-core-energy-path matrix-core-energy-path--m"/);
  assert.match(source, /className="matrix-core-energy-path matrix-core-energy-path--ring"/);
  assert.match(css, /animation:\s*matrix-core-symbol-circulation 4\.8s linear infinite;/);
  assert.match(css, /@keyframes matrix-core-symbol-circulation/);
  assert.doesNotMatch(source, /className="matrix-core-node"/);
  assert.doesNotMatch(source, /className="matrix-core-energy-loop"/);
});

test("Matrix Core 按下時產生中心擴散光波", () => {
  assert.match(css, /\.home-screen \.matrix-core-banner:active::before/);
  assert.match(css, /animation: matrix-core-click-wave 420ms ease-out both;/);
  assert.match(css, /@keyframes matrix-core-click-wave/);
});
