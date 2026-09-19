import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readLocalCss } from "./helpers/read-local-css.mjs";
import { ruleBodies } from "./helpers/css-rules.mjs";

const css = readLocalCss("src/homepage-repair.css");
const source = readFileSync("src/Prototype.tsx", "utf8");
const switcherSource = source.slice(source.indexOf("export function LotterySwitcher("), source.indexOf("function splitDrawNumbers("));

test("homepage uses four equal compact lottery surfaces with 8px gaps", () => {
  // DESIGN 2026-09-15 and 89ecf19: 50px becomes 40px at the 390px canvas.
  const grid = ruleBodies(css, /^\.lottery-switcher--home-style \.lottery-switcher-hit-grid$/);
  assert.equal(grid.length, 1);
  assert.match(grid[0], /height:\s*max\(36px, calc\(100cqw \* 214 \/ 1532 - 10px\)\);/);
  assert.match(grid[0], /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(grid[0], /gap:\s*8px;/);
  assert.doesNotMatch(css, /Matrixbba\.png|background-size:\s*calc\(400%/);
});

test("each lottery uses its original independent logo inside intrinsic alpha bounds", () => {
  const expected = [
    ["今彩539", "jincai-539-logo.png", "276 138 1276 583"],
    ["天天樂", "fantasy-5-logo.png", "263 157 1036 626"],
    ["六合彩", "mark-six-logo.png", "243 293 796 566"],
    ["大樂透", "lotto-649-logo.png", "331 160 1086 579"],
  ];
  for (const [id, logo, viewBox] of expected) {
    const option = source.match(new RegExp(`id: "${id}",([^}]+)`))?.[1] ?? "";
    assert.ok(option.includes(`logo: "/assets/lottery/${logo}"`), `${id} keeps its original asset`);
    assert.ok(option.includes(`logoViewBox: "${viewBox}"`), `${id} keeps its intrinsic alpha bounds`);
  }
  assert.match(switcherSource, /<svg className="lottery-selector-logo" viewBox=\{lottery\.logoViewBox\} aria-hidden="true" focusable="false">/);
  assert.match(switcherSource, /<image href=\{lottery\.logo\} width=\{lottery\.logoSize\[0\]\} height=\{lottery\.logoSize\[1\]\} \/>/);
  assert.match(switcherSource, /role="radio"\s+aria-checked=\{isSelected\}/);
  assert.match(switcherSource, /tabIndex=\{isSelected \? 0 : -1\}/);
  assert.doesNotMatch(switcherSource, /Matrixbba\.png|independentLogos/);
});

test("lottery selection owns one frame, logo opacity and reduced-motion-aware transitions", () => {
  const cards = ruleBodies(css, /^\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card$/).filter(body => /(?:^|[;\n])\s*border:/.test(body));
  const selectedCards = ruleBodies(css, /^\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]$/);
  assert.equal(cards.length, 1);
  assert.equal(selectedCards.length, 1);
  const [card] = cards;
  const [selected] = selectedCards;
  assert.match(card, /background:\s*var\(--lottery-neutral-950\);/);
  assert.match(card, /border:\s*1px solid color-mix\(in srgb, var\(--home-frame-gold\) 22%, transparent\);/);
  assert.match(card, /border-radius:\s*var\(--home-frame-radius\);/);
  assert.match(card, /transition:\s*var\(--home-lottery-transition, border-color 180ms ease, background-color 180ms ease, filter 180ms ease\);/);
  // 9ad9f41 intentionally raises the selected frame from standard 45% to bright 55%.
  assert.match(selected, /border-color:\s*color-mix\(in srgb, var\(--home-frame-bright\) 55%, transparent\);/);
  assert.match(selected, /background:\s*color-mix\(in srgb, var\(--home-frame-gold\) 6%, var\(--lottery-neutral-950\)\);/);
  assert.match(css, /\.lottery-switcher--home-style \.lottery-selector-logo\s*\{[^}]*opacity:\s*\.6;[^}]*transition:\s*var\(--home-lottery-transition, opacity 180ms ease\);/s);
  assert.match(css, /\.lottery-card\[data-selected="true"\] \.lottery-selector-logo\s*\{[^}]*opacity:\s*1;/s);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.lottery-selector-logo,[^}]*\{[^}]*--home-lottery-transition:\s*none;/s);
  assert.doesNotMatch(card + selected, /(?:box-shadow|filter|opacity|transform|background-blend-mode):/);
  assert.doesNotMatch(css, /\.lottery-card(?:::[a-z]+|\[data-selected="true"\]::[a-z]+)\s*\{/);
});
