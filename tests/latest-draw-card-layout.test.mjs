import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");
const source = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");

function ruleBodies(sourceText, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...sourceText.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "gs"))].map((match) => match[1]);
}

function hasRuleProperty(sourceText, selector, pattern) {
  return ruleBodies(sourceText, selector).some((body) => pattern.test(body));
}

test("首頁開獎資訊卡頂部固定左中右三區", () => {
  assert.match(source, /<div className="draw-meta"[\s\S]*<div className="draw-order"[\s\S]*className="history-link"/);
  assert.doesNotMatch(source, /className="draw-toolbar"/);
  assert.match(css, /\.home-screen \.latest-draw-card\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(104px, 30%\) minmax\(0, 1fr\)/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.draw-issue strong\s*\{[^}]*font-size:\s*13px/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.draw-date\s*\{[^}]*font-size:\s*9px/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.history-link\s*\{[^}]*font-size:\s*10px[^}]*gap:\s*2px/s);
});

test("順球落球縮減尺寸並使用 2.5px 內側間距", () => {
  const selector = ".home-screen .latest-draw-card .draw-order";
  assert.ok(hasRuleProperty(css, selector, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/));
  assert.ok(hasRuleProperty(css, selector, /width:\s*clamp\(110px, calc\(32vw - 6px\), 118px\);/));
  assert.ok(hasRuleProperty(css, selector, /height:\s*25px;/));
  assert.ok(hasRuleProperty(css, selector, /gap:\s*2\.5px;/));
  assert.ok(hasRuleProperty(css, selector, /border:\s*0;/));
  assert.ok(hasRuleProperty(css, selector, /background:\s*transparent;/));
  assert.ok(hasRuleProperty(css, selector, /justify-self:\s*center;/));
  assert.ok(hasRuleProperty(css, selector, /align-self:\s*start;/));
  assert.ok(hasRuleProperty(css, selector, /margin-block-start:\s*1px;/));
  assert.doesNotMatch(ruleBodies(css, selector).join("\n"), /transform\s*:/);
  assert.match(css, /\.home-screen \.latest-draw-card \.draw-order button\s*\{[^}]*border:\s*1px solid rgba\(230, 177, 76, \.58\);[^}]*border-radius:\s*14px;[^}]*background:\s*linear-gradient/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.draw-order button:first-child\s*\{[^}]*border-radius:\s*14px 2px 2px 14px;/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.draw-order button:last-child\s*\{[^}]*border-radius:\s*2px 14px 14px 2px;/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.draw-order button\[data-selected="true"\]\s*\{[^}]*border-color:\s*rgba\(244, 192, 82, \.82\);[^}]*color:\s*#ffd36c;[^}]*radial-gradient/s);
});

test("開獎資訊卡使用獨立 16px 左右外距", () => {
  assert.match(css, /\.home-screen \.latest-draw-card\s*\{[^}]*--draw-card-height:\s*calc\([^\n]*var\(--home-content-width\)[^\n]*\);/s);
  assert.match(css, /\.home-screen \.latest-draw-card\s*\{[^}]*width:\s*calc\(100% - 32px\);[^}]*margin-inline:\s*0;[^}]*padding:\s*9px 0 0;/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.next-draw-info--embedded\s*\{[^}]*margin:\s*0;/s);
});

test("下次開獎與剩餘時間數值使用中階暖灰色", () => {
  assert.match(css, /\.next-draw-icon\s*\{[^}]*color:\s*#e6b34f;/s);
  assert.match(css, /\.next-draw-label\s*\{[^}]*color:\s*#d8a653;/s);
  assert.match(css, /\.next-draw-value\s*\{[^}]*color:\s*color-mix\(in srgb, var\(--lottery-neutral-100\) 60%, var\(--lottery-neutral-400\)\);/s);
});

test("期數日期與查看更多紀錄維持既有定位，順落球由格線自然上移", () => {
  assert.match(css, /\.home-screen \.latest-draw-card\s*\{[^}]*grid-template-rows:\s*44px minmax\(0, 1fr\) 24px/s);
  assert.match(css, /\.home-screen \.latest-draw-card::before\s*\{[^}]*inset:\s*44px 4px 24px/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.draw-meta\s*\{[^}]*transform:\s*translateY\(-8px\);/s);
  assert.doesNotMatch(ruleBodies(css, ".home-screen .latest-draw-card .draw-order").join("\n"), /transform\s*:/);
  assert.match(css, /\.home-screen \.latest-draw-card \.history-link\s*\{[^}]*transform:\s*translate\(-10px, -16px\);/s);
});

test("特別號標籤右移、分隔線縮短且底部圖示維持 12px", () => {
  assert.match(css, /\.home-screen \.latest-draw-card \.special-label\s*\{[^}]*right:\s*calc\(50% - 1px\);/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.special-ball-separator\s*\{[^}]*height:\s*calc\(var\(--draw-special-ball-size\) \+ 4px\);/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.next-draw-info--embedded \.next-draw-item\s*\{[^}]*grid-template-columns:\s*12px auto minmax\(0, 1fr\);/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.next-draw-info--embedded \.next-draw-icon\s*\{[^}]*width:\s*12px;[^}]*height:\s*12px;/s);
});

test("底部兩格時間資訊沿用主卡的單層細金框與圓角", () => {
  assert.match(css, /\.home-screen \.latest-draw-card \.next-draw-info--embedded\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)[^}]*width:\s*100%[^}]*padding:\s*0;[^}]*gap:\s*0;[^}]*border:\s*0;[^}]*background:\s*transparent/s);
  assert.ok(hasRuleProperty(css, ".home-screen .latest-draw-card .next-draw-info--embedded .next-draw-item", /gap:\s*4px;[^}]*padding-inline:\s*clamp\(6px, 2vw, 10px\);[^}]*align-items:\s*center[^}]*justify-content:\s*center/));
  const itemSelector = ".home-screen .latest-draw-card .next-draw-info--embedded .next-draw-item";
  const itemRules = ruleBodies(css, itemSelector);
  assert.equal(itemRules.length, 1);
  assert.match(itemRules[0], /border:\s*0;[^}]*border-radius:\s*var\(--home-frame-radius\);/s);
  assert.match(itemRules[0], /box-shadow:\s*inset 0 0 0 1px var\(--home-frame-bright\);/);
  assert.doesNotMatch(itemRules[0], /clip-path\s*:/);
  assert.equal(ruleBodies(css, `${itemSelector}::before`).length, 0);
  assert.doesNotMatch(css, /\.home-screen \.latest-draw-card \.next-draw-info--embedded\s*\{[^}]*border-top\s*:/s);
  assert.doesNotMatch(css, /\.home-screen \.latest-draw-card \.next-draw-info--embedded \.next-draw-item:last-child\s*\{[^}]*border-inline-start\s*:/s);
  assert.match(css, /\.next-draw-label\s*\{[^}]*font-size:\s*11px/s);
  assert.match(css, /\.next-draw-value\s*\{[^}]*font-size:\s*11px/s);
});

test("開獎卡使用單層細金框與簡潔背景，保留內容盒尺寸", () => {
  const cardRules = ruleBodies(css, ".home-screen .latest-draw-card").join("\n");
  assert.match(cardRules, /border:\s*0;[^}]*border-radius:\s*var\(--home-frame-radius\);/s);
  assert.match(cardRules, /box-shadow:\s*inset 0 0 0 1px var\(--home-frame-bright\);/);
  assert.doesNotMatch(cardRules, /clip-path\s*:|開獎資訊卡\.png/);
  assert.equal(ruleBodies(css, ".home-screen .latest-draw-card::after").length, 0);
  assert.match(css, /\.home-screen \.latest-draw-card::before\s*\{[^}]*radial-gradient\(ellipse at 50% 100%[^}]*pointer-events:\s*none/s);
  assert.match(css, /\.home-screen \.latest-draw-card > \*\s*\{[^}]*z-index:\s*1/s);
});
