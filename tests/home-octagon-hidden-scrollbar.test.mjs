import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync(new URL("../src/homepage/visual-language.css", import.meta.url), "utf8");
const base = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");
const switcher = readFileSync(new URL("../src/homepage/lottery-switcher.css", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const feature = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");

test("首頁卡片各自使用單層圓角框", () => {
  assert.match(base, /\.home-screen \.latest-draw-card\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*var\(--home-frame-radius\);[^}]*box-shadow:\s*inset 0 0 0 1px var\(--home-frame-bright\);/s);
  assert.match(switcher, /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\s*\{[^}]*border:\s*1px solid var\(--home-frame-muted\);[^}]*border-radius:\s*var\(--home-frame-radius\);/s);
  assert.match(base, /\.home-screen \.matrix-core-banner\s*\{[^}]*border:\s*1px solid var\(--home-frame-bright\);[^}]*border-radius:\s*var\(--home-frame-radius\);/s);
  assert.match(base, /\.home-screen \.home-shortcut\s*\{[^}]*border:\s*1px solid var\(--home-frame-muted\);[^}]*border-radius:\s*var\(--home-frame-radius\);/s);
  assert.doesNotMatch(`${base}\n${switcher}`, /(?:latest-draw-card|lottery-card|matrix-core-banner|home-shortcut)[^{}]*\{[^}]*clip-path:\s*polygon\(/s);
});

test("切換彩種、Matrix Core 與四大功能不建立第二層偽元素框", () => {
  assert.doesNotMatch(switcher, /\.lottery-card::(?:before|after)\s*\{/);
  assert.doesNotMatch(base, /\.home-shortcut::(?:before|after)\s*\{/);
  assert.doesNotMatch(base, /\.matrix-core-banner::(?:before|after)\s*\{/);
  assert.doesNotMatch(base, /\.home-shortcut:(?:first-child|nth-child)/);
});

test("下次開獎與剩餘時間鑲嵌在卡內並各自保留完整圓角框", () => {
  assert.match(
    base,
    /\.next-draw-info--embedded\s*\{[^}]*gap:\s*0;[^}]*background:\s*transparent;[^}]*overflow:\s*visible;/s,
  );
  assert.doesNotMatch(base, /\.next-draw-info--embedded::before\s*\{/s);
  assert.match(base, /\.next-draw-info--embedded \.next-draw-item\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*var\(--home-frame-radius\);[^}]*background:\s*linear-gradient[^}]*box-shadow:\s*inset 0 0 0 1px var\(--home-frame-bright\);[^}]*overflow:\s*hidden;/s);
  assert.doesNotMatch(base, /\.next-draw-info--embedded \.next-draw-item::before\s*\{/s);
  assert.doesNotMatch(base, /\.next-draw-info--embedded \.next-draw-item \+ \.next-draw-item\s*\{[^}]*border-left:/s);
});

test("四大功能直接使用正式圓角框且沒有遮罩覆寫", () => {
  assert.match(base, /\.home-screen \.home-shortcut\s*\{[^}]*border:\s*1px solid var\(--home-frame-muted\);[^}]*border-radius:\s*var\(--home-frame-radius\);/s);
  assert.doesNotMatch(base, /\.home-shortcut::(?:before|after)\s*\{/);
  assert.doesNotMatch(base, /\.home-shortcut\s*\{[^}]*(?:mask|clip-path):/s);
  assert.doesNotMatch(base, /\.home-shortcut:(?:first-child|nth-child)/);
});

test("開獎資訊卡使用單層亮金圓角框，狀態區共同容器外框維持隱藏", () => {
  assert.match(base, /\.home-screen \.latest-draw-card\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*var\(--home-frame-radius\);[^}]*box-shadow:\s*inset 0 0 0 1px var\(--home-frame-bright\);/s);
  assert.doesNotMatch(base, /\.home-screen \.latest-draw-card::after\s*\{/s);
  assert.match(base, /\.home-screen \.matrix-status-section\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
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
