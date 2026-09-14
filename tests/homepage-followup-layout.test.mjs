import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const base = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");
const switcher = readFileSync(new URL("../src/homepage/lottery-switcher.css", import.meta.url), "utf8");

function block(source, selector) {
  const start = source.lastIndexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing selector: ${selector}`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

test("首頁使用 16px 正式內距、100% 功能圖片與對齊的 Matrix Core", () => {
  assert.match(base, /\.home-screen \.home-layout\s*\{[^}]*--home-feature-inline:\s*16px;/s);
  assert.match(block(base, ".home-screen .home-shortcut img"), /width:\s*100%;/);
  assert.match(block(base, ".home-screen .home-shortcut img"), /height:\s*100%;/);
  assert.match(base, /\.home-screen \.matrix-status-section\s*\{[^}]*padding-inline:\s*0;/s);
  assert.match(base, /\.home-screen \.home-bottom-group\s*\{[^}]*--home-core-width:\s*calc\(min\(100vw, 390px\) - 32px\);/s);
});

test("首頁彩種以單層圓角框與背景明暗表示選取", () => {
  const card = block(switcher, '.lottery-switcher--home-style > .lottery-switcher-hit-grid > .lottery-card');
  const selected = block(switcher, '.lottery-switcher--home-style > .lottery-switcher-hit-grid > .lottery-card[data-selected="true"]');
  assert.match(card, /border:\s*1px solid var\(--home-frame-muted\);/);
  assert.match(card, /border-radius:\s*var\(--home-frame-radius\);/);
  assert.match(card, /background-color:\s*rgba\(0, 0, 0, \.4\);/);
  assert.match(selected, /background-color:\s*transparent;/);
  assert.doesNotMatch(switcher, /\.lottery-card\[data-selected="true"\]::before\s*\{/);
});
