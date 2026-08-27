import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homeCss = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");
const guideCss = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");
const legacyGuideCss = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const guideStart = source.indexOf("export function MatrixGuidePage");
const guideEnd = source.indexOf("export function MatrixNotebookPage", guideStart);
const guideSource = source.slice(guideStart, guideEnd);

test("首頁各區塊獨立擁有指定左右外距", () => {
  assert.match(homeCss, /\.home-screen \.lottery-screen\s*\{[^}]*--home-content-width:\s*calc\(min\(100vw, 390px\) - 24px\);[^}]*padding:\s*0;/s);
  assert.match(homeCss, /\.lottery-switcher--home-style\s*\{[^}]*width:\s*calc\(100% - 32px\);/s);
  assert.match(homeCss, /\.home-screen \.latest-draw-card\s*\{[^}]*width:\s*calc\(100% - 24px\);/s);
  assert.match(homeCss, /\.home-screen \.matrix-status-section\s*\{[^}]*width:\s*calc\(100% - 24px\);/s);
  assert.match(homeCss, /--home-core-width:\s*calc\(min\(100vw, 390px\) - 32px\);/s);
  assert.match(homeCss, /\.home-screen \.home-shortcut-row\s*\{[^}]*width:\s*calc\(100% - 16px\);/s);
});

test("開獎資訊卡底列回復修改前的內部排版", () => {
  assert.match(homeCss, /\.next-draw-info--embedded\s*\{[^}]*gap:\s*3px;/s);
  assert.match(homeCss, /\.next-draw-item\s*\{[^}]*gap:\s*4px;[^}]*padding-inline:\s*clamp\(6px, 2vw, 10px\);/s);
  assert.doesNotMatch(homeCss, /\.next-draw-item:first-child\s*\{|\.next-draw-item:last-child\s*\{/s);
});

test("Matrix 指南不在原生慣性滑動期間改寫 scrollLeft", () => {
  assert.match(source, /const GUIDE_LOOP_IDLE_MS = 120;/);
  assert.match(guideSource, /window\.setTimeout\(normalizeLoop, GUIDE_LOOP_IDLE_MS\)/);
  assert.doesNotMatch(guideSource, /requestAnimationFrame\(normalizeLoop\)/);
  assert.match(guideSource, /strip\.addEventListener\("scroll", handleScroll, \{ passive: true \}\)/);
});

test("Matrix 指南卡片放大 20%、數字色固定且舊外框規則已移除", () => {
  assert.match(guideCss, /\.matrix-guide-screen \.guide-category-strip\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
  assert.match(guideCss, /\.guide-category-card\s*\{[^}]*min-height:\s*26\.4px;[^}]*padding:\s*4\.8px 9\.6px;[^}]*gap:\s*4\.8px;[^}]*border-radius:\s*9\.6px;[^}]*font-size:\s*14\.4px;/s);
  assert.match(guideCss, /\.guide-category-card > span\s*\{[^}]*color:\s*#b58322;[^}]*font-size:\s*13\.2px;/s);
  assert.doesNotMatch(legacyGuideCss, /\.guide-category-strip(?: button)?\s*\{/);
});
