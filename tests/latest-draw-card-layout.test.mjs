import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");
const source = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");

test("首頁開獎資訊卡頂部固定左中右三區", () => {
  assert.match(source, /<div className="draw-meta"[\s\S]*<div className="draw-order"[\s\S]*className="history-link"/);
  assert.doesNotMatch(source, /className="draw-toolbar"/);
  assert.match(css, /\.home-screen \.latest-draw-card\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 118px minmax\(0, 1fr\)/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.draw-issue strong\s*\{[^}]*font-size:\s*13px/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.draw-date\s*\{[^}]*font-size:\s*9px/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.history-link\s*\{[^}]*font-size:\s*10px[^}]*gap:\s*6px/s);
});

test("開獎資訊卡左右外距為 16px，並移除左右 6px 內距與底部外擴", () => {
  assert.match(css, /\.home-screen \.latest-draw-card\s*\{[^}]*--draw-card-height:\s*calc\([^\n]*var\(--home-content-width\) - 8px[^\n]*\);/s);
  assert.match(css, /\.home-screen \.latest-draw-card\s*\{[^}]*width:\s*calc\(100% - 8px\);[^}]*margin-inline:\s*4px;[^}]*padding:\s*9px 0 0;/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.next-draw-info--embedded\s*\{[^}]*margin:\s*0;/s);
});

test("下次開獎與剩餘時間數值使用既有次要文字色", () => {
  assert.match(css, /\.next-draw-icon\s*\{[^}]*color:\s*#e6b34f;/s);
  assert.match(css, /\.next-draw-label\s*\{[^}]*color:\s*#d8a653;/s);
  assert.match(css, /\.next-draw-value\s*\{[^}]*color:\s*var\(--lottery-text-secondary\);/s);
});

test("期數日期維持上移，查看更多紀錄再左移 2px", () => {
  assert.match(css, /\.home-screen \.latest-draw-card\s*\{[^}]*grid-template-rows:\s*44px minmax\(0, 1fr\) 24px/s);
  assert.match(css, /\.home-screen \.latest-draw-card::before\s*\{[^}]*inset:\s*44px 4px 24px/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.draw-meta\s*\{[^}]*transform:\s*translateY\(-8px\);/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.draw-order\s*\{[^}]*transform:\s*translateY\(-6px\);/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.history-link\s*\{[^}]*transform:\s*translate\(-10px, -16px\);/s);
});

test("特別號標籤右移、分隔線縮短且底部圖示縮為 12px", () => {
  assert.match(css, /\.home-screen \.latest-draw-card \.special-label\s*\{[^}]*right:\s*calc\(50% - 1px\);/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.special-ball-separator\s*\{[^}]*height:\s*calc\(var\(--draw-special-ball-size\) \+ 4px\);/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.next-draw-info--embedded \.next-draw-item\s*\{[^}]*grid-template-columns:\s*12px auto minmax\(0, 1fr\);/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.next-draw-info--embedded \.next-draw-icon\s*\{[^}]*width:\s*12px;[^}]*height:\s*12px;/s);
});

test("底部資訊左右兩欄垂直置中並降低時間字級", () => {
  assert.match(css, /\.home-screen \.latest-draw-card \.next-draw-info--embedded\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)[^}]*align-items:\s*center/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.next-draw-info--embedded \.next-draw-item\s*\{[^}]*align-items:\s*center[^}]*justify-content:\s*center/s);
  assert.match(css, /\.next-draw-icon\s*\{[^}]*width:\s*12px[^}]*height:\s*12px/s);
  assert.match(css, /\.next-draw-label\s*\{[^}]*font-size:\s*11px/s);
  assert.match(css, /\.next-draw-value\s*\{[^}]*font-size:\s*11px/s);
});

test("彩球區降低周邊光效並保留中央光點與底部波紋", () => {
  assert.match(css, /\.home-screen \.latest-draw-card::before\s*\{[^}]*radial-gradient\(circle at 50% 82%[^}]*pointer-events:\s*none/s);
  assert.match(css, /\.home-screen \.latest-draw-card > \*\s*\{[^}]*z-index:\s*1/s);
});
