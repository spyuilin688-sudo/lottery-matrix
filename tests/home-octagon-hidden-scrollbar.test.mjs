import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync(new URL("../src/homepage/visual-language.css", import.meta.url), "utf8");
const base = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const feature = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");

test("首頁指定圖示與卡片共用同一個響應式八角切角", () => {
  assert.match(home, /--home-octagon-cut:\s*clamp\(4px, 1\.54vw, 6px\);/);
  assert.match(
    home,
    /\.lottery-card,[\s\S]*?\.latest-draw-card,[\s\S]*?\.matrix-status-card,[\s\S]*?\.matrix-core-banner[\s\S]*?clip-path:\s*polygon\(/,
  );
  assert.match(base, /\.home-shortcut\s*\{[^}]*clip-path:\s*polygon\(/s);
  assert.match(home, /border-radius:\s*0;/);
});

test("切換彩種、Matrix Core 與五大功能共用雙層八角框線", () => {
  assert.match(home, /--home-frame-inset:\s*2px;/);
  assert.match(home, /--home-frame-inner-color:/);
  assert.match(home, /--home-octagon-frame:\s*[\s\S]*?linear-gradient\(/);
  assert.match(home, /\.lottery-card\s*\{[^}]*border:\s*0;/s);
  assert.match(base, /\.home-shortcut\s*\{[^}]*border:\s*0;/s);
  assert.match(
    home,
    /\.lottery-card::after\s*\{[^}]*display:\s*block;[^}]*background:\s*var\(--home-octagon-frame\);[^}]*-webkit-mask:\s*none;[^}]*mask:\s*none;/s,
  );
  assert.match(base, /\.home-shortcut::after\s*\{[^}]*display:\s*block;[^}]*background:\s*var\(--home-octagon-frame\);/s);
  assert.match(
    home,
    /\.matrix-core-banner\s*\{[^}]*border:\s*0;[^}]*background:\s*var\(--home-octagon-frame\),\s*url\("\/assets\/lottery\/functions\/matrixcore\.png"\)/s,
  );
  assert.doesNotMatch(base, /\.home-shortcut:(?:first-child|nth-child)/);
});

test("下次開獎與剩餘時間鑲嵌在卡內並各自保留完整切角框", () => {
  assert.match(
    home,
    /\.next-draw-info--embedded\s*\{[^}]*gap:\s*0;[^}]*background:\s*transparent;[^}]*overflow:\s*visible;/s,
  );
  assert.match(
    home,
    /\.next-draw-info--embedded::before\s*\{[^}]*display:\s*none;/s,
  );
  assert.match(home, /\.next-draw-info--embedded \.next-draw-item\s*\{[^}]*border:\s*0;[^}]*background:\s*linear-gradient[^}]*clip-path:\s*polygon\(/s);
  assert.match(home, /\.next-draw-info--embedded \.next-draw-item::before\s*\{[^}]*background:\s*var\(--home-octagon-frame\);[^}]*content:\s*"";/s);
  assert.doesNotMatch(home, /\.next-draw-info--embedded \.next-draw-item \+ \.next-draw-item\s*\{[^}]*border-left:/s);
});

test("五大功能先遮蔽素材舊框再套用共用切角框", () => {
  assert.match(base, /\.home-shortcut::before\s*\{[^}]*background:\s*var\(--lottery-neutral-950\);[^}]*-webkit-mask-composite:\s*xor;[^}]*mask-composite:\s*exclude;/s);
  assert.match(base, /\.home-shortcut::after\s*\{[^}]*background:\s*var\(--home-octagon-frame\);/s);
  assert.doesNotMatch(base, /\.home-shortcut:(?:first-child|nth-child)/);
});

test("開獎資訊卡使用切角框，狀態區共同容器外框維持隱藏", () => {
  assert.match(home, /\.home-screen \.latest-draw-card\s*\{[^}]*border:\s*0;[^}]*box-shadow:\s*var\(--home-frame-shadow\);/s);
  assert.match(home, /\.home-screen \.latest-draw-card::after\s*\{[^}]*background:\s*var\(--home-octagon-frame\);[^}]*content:\s*"";/s);
  assert.match(home, /\.home-screen \.matrix-status-section\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
});

test("所有頁面隱藏原生與自訂捲動條但不關閉 overflow", () => {
  assert.match(styles, /\*\s*\{[^}]*scrollbar-width:\s*none;/s);
  assert.match(styles, /\*::-webkit-scrollbar\s*\{[^}]*display:\s*none;[^}]*width:\s*0;[^}]*height:\s*0;/s);
  assert.match(styles, /\.mobile-carousel-scrollbar,[\s\S]*?\.mobile-scrollbar\s*\{[^}]*display:\s*none;/s);
  assert.match(styles, /\.mobile-scroll\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.doesNotMatch(styles, /scrollbar-width:\s*thin/);
});

test("連碰與立柱清除圖示放大至 10px且不超過文字大小", () => {
  assert.match(feature, /\.calculator-panel header button svg,[\s\S]*?\.quick-actions \.clear-button svg\s*\{[^}]*width:\s*10px;[^}]*height:\s*10px;/s);
  assert.match(feature, /\.calculator-panel header button\s*\{[^}]*font-size:\s*12px;/s);
  assert.match(feature, /\.quick-actions button\s*\{[^}]*font-size:\s*12px;/s);
});
