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

test("首頁彩種以單層圓角框與 Logo 透明度表示選取", () => {
  assert.match(switcher, /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\s*\{[^}]*border:\s*1px solid color-mix\(in srgb, var\(--home-frame-gold\) 22%, transparent\);[^}]*border-radius:\s*var\(--home-frame-radius\);[^}]*background:\s*var\(--lottery-neutral-950\);/s);
  assert.match(switcher, /\.lottery-card\[data-selected="true"\]\s*\{[^}]*border-color:\s*color-mix\(in srgb, var\(--home-frame-bright\) 55%, transparent\);[^}]*background:\s*color-mix\(in srgb, var\(--home-frame-gold\) 6%, var\(--lottery-neutral-950\)\);/s);
  assert.match(switcher, /\.lottery-selector-logo\s*\{[^}]*opacity:\s*\.6;/s);
  assert.match(switcher, /\.lottery-card\[data-selected="true"\] \.lottery-selector-logo\s*\{[^}]*opacity:\s*1;/s);
  assert.doesNotMatch(switcher, /\.lottery-card(?:\[data-selected="true"\])?::(?:before|after)\s*\{/);
});
