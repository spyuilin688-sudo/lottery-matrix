import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");

test("Matrix 指南使用三組原生捲動內容並在頭尾等距校正", () => {
  assert.match(source, /const GUIDE_LOOP_GROUPS = \["leading", "canonical", "trailing"\] as const;/);
  assert.match(source, /useLayoutEffect\(\(\) =>/);
  assert.match(source, /\[data-guide-group="leading"\] \.guide-category-card/);
  assert.match(source, /\[data-guide-group="canonical"\] \.guide-category-card/);
  assert.match(source, /canonicalStart\.offsetLeft - leadingStart\.offsetLeft/);
  assert.match(source, /strip\.scrollLeft \+= span/);
  assert.match(source, /strip\.scrollLeft -= span/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /new ResizeObserver/);
  assert.match(source, /aria-hidden=\{isClone\}/);
  assert.match(source, /isClone \? \([\s\S]*?<span className="guide-category-card"[\s\S]*?\) : \([\s\S]*?<button[\s\S]*?aria-pressed=\{selected === index\}/);
  assert.doesNotMatch(source, /aria-hidden=\{isClone\}[\s\S]*?tabIndex=/);
});

test("Matrix 指南滑動卡片與說明維持指定間距及字級", () => {
  assert.match(css, /\.matrix-guide-screen \.guide-category-strip\s*\{[^}]*margin-bottom:\s*5px;[^}]*padding:\s*4px 0;[^}]*scroll-snap-type:\s*x proximity;[^}]*touch-action:\s*pan-y;/s);
  assert.match(css, /\.matrix-guide-screen \.guide-category-strip \.guide-category-card\s*\{[^}]*flex:\s*0 0 auto;[^}]*width:\s*max-content;[^}]*min-height:\s*22px;[^}]*padding:\s*4px 8px;[^}]*grid-template-columns:\s*auto auto;[^}]*gap:\s*4px;[^}]*white-space:\s*nowrap;[^}]*font-size:\s*12px;[^}]*font-weight:\s*700;/s);
  assert.match(css, /\.matrix-guide-screen \.guide-category-strip \.guide-category-card > span\s*\{[^}]*font-size:\s*11px;[^}]*font-weight:\s*700;/s);
  assert.match(css, /\.matrix-guide-screen \.guide-preview\s*\{[^}]*margin-top:\s*0;/s);
});

test("Matrix 指南觸控拖曳使用半速倍率並避免誤觸選項", () => {
  assert.match(source, /const GUIDE_DRAG_RATE = 0\.5;/);
  assert.match(source, /scrollLeft = guideDrag\.startScrollLeft \+ deltaX \* GUIDE_DRAG_RATE/);
  assert.match(source, /if \(guideSuppressClickRef\.current\)/);
  assert.match(source, /onPointerDown=\{handleGuidePointerDown\}/);
  assert.match(source, /onPointerMove=\{handleGuidePointerMove\}/);
  assert.match(source, /onPointerCancel=\{finishGuidePointer\}/);
});
