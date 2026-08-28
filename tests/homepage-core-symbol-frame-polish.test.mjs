import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const prototype = read("src/Prototype.tsx");
const base = read("src/homepage/base.css");
const switcher = read("src/homepage/lottery-switcher.css");
const visual = read("src/homepage/visual-language.css");

test("Matrix Core 能量只沿 M 與圓環路徑運行", () => {
  assert.match(prototype, /className="matrix-core-symbol-energy"/);
  assert.match(prototype, /className="matrix-core-energy-path matrix-core-energy-path--m"/);
  assert.match(prototype, /className="matrix-core-energy-path matrix-core-energy-path--ring"/);
  assert.doesNotMatch(prototype, /className="matrix-core-node"/);
  assert.doesNotMatch(prototype, /className="matrix-core-energy-loop"/);
  assert.match(visual, /\.matrix-core-energy-path\s*\{[^}]*animation:\s*matrix-core-symbol-circulation/s);
  assert.match(visual, /@keyframes matrix-core-symbol-circulation/);
});

test("首頁彩種容器外框隱藏且 0.7px 選取框完整內縮", () => {
  assert.match(switcher, /\.lottery-switcher--home-style\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
  assert.match(switcher, /\.lottery-card\[data-selected="true"\]::before\s*\{[^}]*--matrix-selected-frame-width:\s*\.7px;[^}]*inset:\s*\.5px;[^}]*-webkit-mask:/s);
  const selectedFrame = switcher.match(/\.lottery-card\[data-selected="true"\]::before\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.doesNotMatch(selectedFrame, /content-box|mask-composite/);
});

test("五大功能圖片恢復 100% 且不改變既有排列", () => {
  assert.match(base, /\.home-screen \.home-shortcut img\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s);
  assert.match(base, /--home-feature-inline:\s*10px;/);
});

test("開獎資訊卡加深外切角且重設底部資訊卡切角", () => {
  assert.match(visual, /\.home-screen \.latest-draw-card\s*\{[^}]*--home-octagon-cut:\s*clamp\(6px, 2\.05vw, 8px\);/s);
  assert.match(visual, /\.home-screen \.latest-draw-card::after\s*\{[^}]*box-shadow:\s*inset 0 0 0 1px/s);
  assert.match(visual, /\.latest-draw-card \.next-draw-info--embedded \.next-draw-item\s*\{[^}]*--home-octagon-cut:\s*clamp\(4px, 1\.54vw, 6px\);/s);
});
