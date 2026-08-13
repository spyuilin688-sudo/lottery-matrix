import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../src/homepage-repair.css", import.meta.url), "utf8");

test("Matrix Core 使用 8 秒掃描、核心脈衝與能量軌跡", () => {
  assert.match(css, /animation: matrix-core-pulse 8s ease-in-out infinite;/);
  assert.match(css, /animation: matrix-core-stardust-scan 8s ease-in-out infinite;/);
  assert.match(css, /@keyframes matrix-core-pulse/);
  assert.match(css, /@keyframes matrix-core-stardust-scan/);
  assert.match(css, /rgba\(255, 211, 108, \.319\)/);
});

test("Matrix Core 按下時產生中心擴散光波", () => {
  assert.match(css, /\.home-screen \.matrix-core-banner:active::before/);
  assert.match(css, /animation: matrix-core-click-wave 420ms ease-out both;/);
  assert.match(css, /@keyframes matrix-core-click-wave/);
});
