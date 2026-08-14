import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/homepage-repair.css", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");

test("首頁開獎資訊卡頂部固定左中右三區", () => {
  assert.match(source, /<div className="draw-meta"[\s\S]*<div className="draw-order"[\s\S]*className="history-link"/);
  assert.match(css, /\.home-screen \.latest-draw-card \.draw-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 118px minmax\(0, 1fr\)/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.draw-issue strong\s*\{[^}]*font-size:\s*13px/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.draw-date\s*\{[^}]*font-size:\s*9px/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.history-link\s*\{[^}]*font-size:\s*10px[^}]*gap:\s*6px/s);
});

test("底部資訊左右兩欄垂直置中並降低時間字級", () => {
  assert.match(css, /\.home-screen \.latest-draw-card \.next-draw-info--embedded\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)[^}]*align-items:\s*center/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.next-draw-info--embedded \.next-draw-item\s*\{[^}]*align-items:\s*center[^}]*justify-content:\s*center/s);
  assert.match(css, /\.next-draw-icon\s*\{[^}]*width:\s*14px[^}]*height:\s*14px/s);
  assert.match(css, /\.next-draw-label\s*\{[^}]*font-size:\s*11px/s);
  assert.match(css, /\.next-draw-value\s*\{[^}]*font-size:\s*11px/s);
});

test("彩球區降低周邊光效並保留中央光點與底部波紋", () => {
  assert.match(css, /\.home-screen \.latest-draw-card::before\s*\{[^}]*radial-gradient\(circle at 50% 82%[^}]*pointer-events:\s*none/s);
  assert.match(css, /\.home-screen \.latest-draw-card > \*\s*\{[^}]*z-index:\s*1/s);
});
