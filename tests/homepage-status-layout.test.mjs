import assert from "node:assert/strict";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");

test("狀態卡上下兩列的垂直間距固定為 4px", () => {
  assert.match(
    css,
    /\.home-screen \.matrix-status-card-grid\s*\{[^}]*row-gap:\s*4px;/s,
  );
});

test("放大的彩種圖示維持在狀態卡圓圈中心", () => {
  assert.match(
    css,
    /\.home-screen \.matrix-status-lottery-logo\s*\{[^}]*top:\s*50%;[^}]*left:\s*83\.5%;[^}]*right:\s*auto;[^}]*width:\s*30%;[^}]*max-width:\s*56px;[^}]*transform:\s*translate\(-50%, -50%\);/s,
  );
});
