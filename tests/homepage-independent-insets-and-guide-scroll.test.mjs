import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homeCss = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");
const guideCss = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const guideStart = source.indexOf("export function MatrixGuidePage");
const guideEnd = source.indexOf("export function MatrixNotebookPage", guideStart);
const guideSource = source.slice(guideStart, guideEnd);

test("首頁各區塊獨立擁有指定左右外距", () => {
  assert.match(homeCss, /\.home-screen \.lottery-screen\s*\{[^}]*--home-content-width:\s*calc\(min\(100vw, 390px\) - 32px\);[^}]*padding:\s*0;/s);
  assert.match(homeCss, /\.lottery-switcher--home-style\s*\{[^}]*width:\s*calc\(100% - 32px\);/s);
  assert.match(homeCss, /\.home-screen \.latest-draw-card\s*\{[^}]*width:\s*calc\(100% - 32px\);/s);
  assert.match(homeCss, /\.home-screen \.matrix-status-section\s*\{[^}]*width:\s*calc\(100% - 32px\);/s);
  assert.match(homeCss, /--home-core-width:\s*calc\(min\(100vw, 390px\) - 28px\);/s);
  assert.match(homeCss, /\.home-screen \.home-shortcut-row\s*\{[^}]*width:\s*100%;[^}]*padding-inline:\s*var\(--home-feature-inline\);/s);
});

test("開獎資訊卡底列使用無縫鑲嵌排版", () => {
  assert.match(homeCss, /\.next-draw-info--embedded\s*\{[^}]*gap:\s*0;/s);
  assert.match(homeCss, /\.next-draw-item\s*\{[^}]*gap:\s*4px;[^}]*padding-inline:\s*clamp\(6px, 2vw, 10px\);/s);
  assert.doesNotMatch(homeCss, /\.next-draw-item:first-child\s*\{|\.next-draw-item:last-child\s*\{/s);
});

test("Matrix 指南不在原生慣性滑動期間改寫 scrollLeft", () => {
  assert.match(source, /const GUIDE_LOOP_IDLE_MS = 200;/);
  assert.match(guideSource, /window\.setTimeout\(normalizeLoop, GUIDE_LOOP_IDLE_MS\)/);
  assert.doesNotMatch(guideSource, /requestAnimationFrame\(normalizeLoop\)/);
  assert.match(guideSource, /strip\.addEventListener\("scroll", handleScroll, \{ passive: true \}\)/);
});

test("Matrix 指南卡片縮小、數字加粗且分隔線保留", () => {
  assert.match(guideCss, /\.matrix-guide-screen \.guide-category-strip\s*\{[^}]*border-top:\s*1px solid[^}]*border-bottom:\s*1px solid[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
  assert.match(guideCss, /\.guide-category-card\s*\{[^}]*min-height:\s*30\.888px;[^}]*padding:\s*5\.616px 11\.232px;[^}]*gap:\s*5\.616px;[^}]*border-radius:\s*12px;[^}]*font-size:\s*16\.848px;/s);
  assert.match(guideCss, /\.guide-category-card > span\s*\{[^}]*color:\s*#c49145;[^}]*font-size:\s*11\.88px;[^}]*font-weight:\s*800;/s);
});
