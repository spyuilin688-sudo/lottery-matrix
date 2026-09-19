import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const prototype = read("src/Prototype.tsx");
const base = read("src/homepage/base.css");
const switcher = read("src/homepage/lottery-switcher.css");
const visual = read("src/homepage/visual-language.css");

test("首頁彩種容器使用單層圓角框與 Logo 透明度表示選取", () => {
  assert.match(switcher, /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\s*\{[^}]*border:\s*1px solid color-mix\(in srgb, var\(--home-frame-gold\) 22%, transparent\);[^}]*border-radius:\s*var\(--home-frame-radius\);[^}]*background:\s*var\(--lottery-neutral-950\);/s);
  assert.match(switcher, /\.lottery-card\[data-selected="true"\]\s*\{[^}]*border-color:\s*color-mix\(in srgb, var\(--home-frame-bright\) 55%, transparent\);[^}]*background:\s*color-mix\(in srgb, var\(--home-frame-gold\) 6%, var\(--lottery-neutral-950\)\);/s);
  assert.match(switcher, /\.lottery-selector-logo\s*\{[^}]*opacity:\s*\.6;/s);
  assert.match(switcher, /\.lottery-card\[data-selected="true"\] \.lottery-selector-logo\s*\{[^}]*opacity:\s*1;/s);
  assert.doesNotMatch(switcher, /\.lottery-card(?:\[data-selected="true"\])?::(?:before|after)\s*\{/);
  assert.doesNotMatch(switcher, /\.lottery-card\s*\{[^}]*(?:clip-path|mask):/s);
  assert.doesNotMatch(prototype, /className="lottery-selected-frame"/);
});

test("四大功能插畫等比例呈現並與 Core 對齊", () => {
  assert.match(base, /\.home-screen \.home-shortcut img\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s);
  assert.match(base, /--home-feature-inline:\s*16px;/);
});

test("開獎資訊卡與底部資訊卡使用同一組亮金圓角框", () => {
  assert.match(base, /\.home-screen \.latest-draw-card\s*\{[^}]*border-radius:\s*var\(--home-frame-radius\);[^}]*box-shadow:\s*inset 0 0 0 1px var\(--home-frame-bright\);/s);
  assert.match(base, /\.latest-draw-card \.next-draw-info--embedded \.next-draw-item\s*\{[^}]*border-radius:\s*var\(--home-frame-radius\);[^}]*box-shadow:\s*inset 0 0 0 1px var\(--home-frame-bright\);/s);
  assert.doesNotMatch(base, /\.latest-draw-card[^{}]*\{[^}]*--home-octagon-cut/);
});
