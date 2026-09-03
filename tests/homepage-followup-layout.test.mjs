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

test("首頁使用指定內距、100% 功能圖片與 14px Matrix Core 外距", () => {
  assert.match(base, /\.home-screen \.home-layout\s*\{[^}]*--home-feature-inline:\s*10px;/s);
  assert.match(block(base, ".home-screen .home-shortcut img"), /width:\s*100%;/);
  assert.match(block(base, ".home-screen .home-shortcut img"), /height:\s*100%;/);
  assert.match(base, /\.home-screen \.matrix-status-section\s*\{[^}]*padding-inline:\s*0;/s);
  assert.match(block(base, ".home-screen .home-bottom-group"), /--home-core-width:\s*calc\(min\(100vw, 390px\) - 28px\);/);
});

test("首頁彩種選取框為 0.7px 等厚八角框並取消額外高亮陰影", () => {
  const selected = block(switcher, '.lottery-switcher--home-style > .lottery-switcher-hit-grid > .lottery-card[data-selected="true"]');
  const selectedFrame = block(switcher, '.lottery-switcher--home-style > .lottery-switcher-hit-grid > .lottery-card[data-selected="true"]::before');
  assert.match(selected, /box-shadow:\s*none;/);
  assert.match(selectedFrame, /--matrix-selected-frame-width:\s*\.7px;/);
  assert.match(selectedFrame, /inset:\s*\.5px;/);
  assert.doesNotMatch(selectedFrame, /clip-path/);
  assert.match(selectedFrame, /var\(--lottery-selected-horizontal-gradient\)/);
  assert.match(selectedFrame, /var\(--lottery-selected-left-edge\)/);
  assert.match(selectedFrame, /var\(--lottery-selected-right-edge\)/);
  assert.doesNotMatch(selectedFrame, /(?:-webkit-)?mask|mask-composite|content-box/);
});
