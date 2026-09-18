import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const balls = readFileSync("src/number-ball.css", "utf8");

test("六合彩近10期與歷史開獎放大至 24px，號碼字級維持原設定", () => {
  assert.match(balls, /\.matrix-explore-main-screen \.matrix-explore-history-panel\.history-panel\[data-lottery="六合彩"\]\s*\{[^}]*--matrix-history-ball-size:\s*clamp\(20px,\s*6\.15vw,\s*24px\);/s);
  assert.match(balls, /\.draw-history-screen \.draw-history-panel\.history-panel\[data-lottery="六合彩"\]\s*\{[^}]*--matrix-history-ball-size:\s*clamp\(20px,\s*6\.15vw,\s*24px\);/s);
  assert.match(balls, /\.matrix-explore-main-screen \.matrix-explore-history-panel\[data-lottery="六合彩"\][^{]*\{[^}]*--number-font-size:\s*clamp\(9px,\s*2\.56vw,\s*10px\);/s);
  assert.match(balls, /\.draw-history-screen \.draw-history-panel\[data-lottery="六合彩"\][^{]*\{[^}]*--number-font-size:\s*clamp\(9px,\s*2\.56vw,\s*10px\);/s);
});

test("六合彩歷史球號仍以共用球心定位，不新增頁面級數字位移", () => {
  assert.match(balls, /\.number-ball-component\[data-lottery="六合彩"\] \.number-ball-value\s*\{[^}]*top:\s*50%;[^}]*left:\s*50%;[^}]*transform:\s*translate\(-50%, -50%\) translate\(var\(--number-optical-x\), var\(--number-optical-y\)\);/s);
  assert.doesNotMatch(balls, /\.matrix-explore-main-screen[^}]*\[data-tone="(?:red|green|blue)"\][^{]*\{[^}]*(?:--number-x|--number-y):/s);
  assert.doesNotMatch(balls, /\.draw-history-screen[^}]*\[data-tone="(?:red|green|blue)"\][^{]*\{[^}]*(?:--number-x|--number-y):/s);
});
