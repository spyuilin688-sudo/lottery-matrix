import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");
const source = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");

test("Matrix Core 使用貼合原圖的 M 與圓環軌跡，並保留外框環流與八節點", () => {
  assert.match(source, /className="matrix-core-symbol-energy" viewBox="0 0 1536 414" preserveAspectRatio="xMidYMid slice"/);
  assert.match(source, /className="matrix-core-energy-path matrix-core-energy-path--m" d="M1099 340V111H1129L1163 222L1197 111H1226V340"/);
  assert.match(source, /className="matrix-core-energy-path matrix-core-energy-path--ring" cx="1163" cy="207" rx="212" ry="144"/);
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
