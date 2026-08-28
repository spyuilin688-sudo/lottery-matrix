import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync(new URL("../src/homepage/visual-language.css", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const feature = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");

test("首頁指定圖示與卡片共用同一個響應式八角切角", () => {
  assert.match(home, /--home-octagon-cut:\s*clamp\(4px, 1\.54vw, 6px\);/);
  assert.match(
    home,
    /\.lottery-card,[\s\S]*?\.latest-draw-card,[\s\S]*?\.matrix-status-card,[\s\S]*?\.matrix-core-banner,[\s\S]*?\.home-shortcut[\s\S]*?clip-path:\s*polygon\(/,
  );
  assert.match(home, /border-radius:\s*0;/);
});

test("切換彩種與五大功能使用獨立八角框線層避免裁切缺框", () => {
  assert.match(home, /--home-octagon-frame:\s*[\s\S]*?linear-gradient\(/);
  assert.match(
    home,
    /\.lottery-card,[\s\S]*?\.home-shortcut\s*\{[^}]*border:\s*0;/s,
  );
  assert.match(
    home,
    /\.lottery-card::after,[\s\S]*?\.home-shortcut::after\s*\{[^}]*display:\s*block;[^}]*background:\s*var\(--home-octagon-frame\);[^}]*-webkit-mask:\s*none;[^}]*mask:\s*none;/s,
  );
});

test("下次開獎與剩餘時間使用完整八角切角框", () => {
  assert.match(
    home,
    /\.next-draw-info--embedded \.next-draw-item\s*\{[^}]*position:\s*relative;[^}]*clip-path:\s*polygon\(/s,
  );
  assert.match(
    home,
    /\.next-draw-info--embedded \.next-draw-item::before\s*\{[^}]*background:\s*var\(--home-octagon-frame\);[^}]*-webkit-mask:\s*none;[^}]*mask:\s*none;/s,
  );
});

test("開獎資訊卡與狀態區共同容器外框隱藏", () => {
  assert.match(home, /\.home-screen \.latest-draw-card\s*\{[^}]*border:\s*0;[^}]*box-shadow:\s*none;/s);
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
