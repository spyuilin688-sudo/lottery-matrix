import assert from "node:assert/strict";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");

test("狀態卡共同外框使用 12px 外距、1.5px 內距與 0.8px 卡片間距", () => {
  assert.match(
    css,
    /\.home-screen \.matrix-status-section\s*\{[^}]*width:\s*calc\(100% - 32px\);[^}]*padding:\s*1\.5px;[^}]*border:\s*1px solid[^}]*border-radius:\s*12px;/s,
  );
  assert.match(
    css,
    /\.home-screen \.matrix-status-card-grid\s*\{[^}]*height:\s*auto;[^}]*grid-template-rows:\s*repeat\(2, auto\);[^}]*gap:\s*0\.8px;[^}]*align-content:\s*start;/s,
  );
  assert.match(
    css,
    /\.home-screen \.matrix-status-artwork\s*\{[^}]*width:\s*100%;[^}]*height:\s*auto;/s,
  );
});

test("彩種圖示再向左 6px，並維持流動尺寸", () => {
  assert.match(
    css,
    /\.home-screen \.matrix-status-lottery-logo\s*\{[^}]*top:\s*50%;[^}]*left:\s*calc\(83\.5% - 24px\);[^}]*right:\s*auto;[^}]*width:\s*54%;[^}]*max-width:\s*none;[^}]*max-height:\s*none;[^}]*transform:\s*translate\(-50%, -50%\);/s,
  );
  assert.doesNotMatch(css, /\.home-screen \.matrix-status-lottery-logo\s*\{[^}]*max-width:\s*56px/s);
});
