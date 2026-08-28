import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");
const source = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");

test("Matrix Core 使用貼合原圖的 M 與圓環軌跡，並保留外框環流與八節點", () => {
  assert.match(source, /className="matrix-core-symbol-energy"/);
  assert.match(source, /className="matrix-core-energy-path matrix-core-energy-path--m" d="M259 71V17H266L274 43L282 17H289V71"/);
  assert.match(source, /className="matrix-core-energy-path matrix-core-energy-path--ring" cx="274" cy="40" rx="50" ry="34"/);
  assert.match(source, /className="matrix-core-energy-loop"/);
  assert.equal((source.match(/className="matrix-core-node"/g) ?? []).length, 8);
  assert.match(css, /stroke-dasharray:\s*5 95;/);
  assert.match(css, /animation:\s*matrix-core-symbol-circulation 4\.8s linear infinite;/);
  assert.match(css, /animation:\s*matrix-core-energy-circulation 4\.8s linear infinite;/);
  assert.match(css, /animation:\s*matrix-core-node-pulse 2\.8s ease-in-out infinite;/);
});

test("Matrix Core 按下時產生中心擴散光波", () => {
  assert.match(css, /\.home-screen \.matrix-core-banner:active::before/);
  assert.match(css, /animation: matrix-core-click-wave 420ms ease-out both;/);
  assert.match(css, /@keyframes matrix-core-click-wave/);
});
