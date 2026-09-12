import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const prototype = read("src/Prototype.tsx");
const base = read("src/homepage/base.css");
const switcher = read("src/homepage/lottery-switcher.css");
const visual = read("src/homepage/visual-language.css");

test("首頁彩種容器外框隱藏且選取時切換為單一 0.7px 響應式框", () => {
  assert.match(switcher, /\.lottery-switcher--home-style\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
  assert.match(switcher, /\.lottery-card\[data-selected="true"\]::after\s*\{[^}]*display:\s*none;/s);
  assert.match(switcher, /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\s*\{[^}]*clip-path:\s*polygon\(/s);
  assert.match(switcher, /\.lottery-card\[data-selected="true"\]::before\s*\{[^}]*--matrix-selected-frame-width:\s*\.7px;/s);
  assert.doesNotMatch(switcher, /\.lottery-card\[data-selected="true"\]::before\s*\{[^}]*-webkit-mask:/s);
  assert.doesNotMatch(prototype, /className="lottery-selected-frame"/);
});

test("四大功能插畫等比例呈現並與 Core 對齊", () => {
  assert.match(base, /\.home-screen \.home-shortcut img\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s);
  assert.match(base, /--home-feature-inline:\s*16px;/);
});

test("開獎資訊卡加深外切角且重設底部資訊卡切角", () => {
  assert.match(visual, /\.home-screen \.latest-draw-card\s*\{[^}]*--home-octagon-cut:\s*clamp\(6px, 2\.05vw, 8px\);/s);
  assert.match(visual, /\.home-screen \.latest-draw-card::after\s*\{[^}]*box-shadow:\s*inset 0 0 0 1px/s);
  assert.match(visual, /\.latest-draw-card \.next-draw-info--embedded \.next-draw-item\s*\{[^}]*--home-octagon-cut:\s*clamp\(4px, 1\.54vw, 6px\);/s);
});
