import assert from "node:assert/strict";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");

test("狀態卡使用一致的 8px 水平與垂直間距", () => {
  assert.match(
    css,
    /\.home-screen \.matrix-status-card-grid\s*\{[^}]*height:\s*100%;[^}]*grid-template-rows:\s*repeat\(2, auto\);[^}]*gap:\s*8px;[^}]*align-content:\s*end;/s,
  );
  assert.match(
    css,
    /\.home-screen \.matrix-status-artwork\s*\{[^}]*width:\s*100%;[^}]*height:\s*auto;/s,
  );
});

test("放大的彩種圖示維持在狀態卡圓圈中心", () => {
  assert.match(
    css,
    /\.home-screen \.matrix-status-lottery-logo\s*\{[^}]*top:\s*50%;[^}]*left:\s*83\.5%;[^}]*right:\s*auto;[^}]*width:\s*30%;[^}]*max-width:\s*56px;[^}]*transform:\s*translate\(-50%, -50%\);/s,
  );
});
