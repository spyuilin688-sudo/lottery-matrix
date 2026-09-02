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
  assert.match(source, /window\.setTimeout\(normalizeLoop, GUIDE_LOOP_IDLE_MS\)/);
  assert.doesNotMatch(source, /requestAnimationFrame\(normalizeLoop\)/);
  assert.match(source, /new ResizeObserver/);
  assert.match(source, /aria-hidden=\{isClone\}/);
  assert.match(source, /isClone \? \([\s\S]*?<span className="guide-category-card"[\s\S]*?\) : \([\s\S]*?<button[\s\S]*?aria-pressed=\{selected === index\}/);
  assert.doesNotMatch(source, /aria-hidden=\{isClone\}[\s\S]*?tabIndex=/);
});

test("Matrix 指南滑動卡片與說明維持指定間距、字級及原生觸控", () => {
  assert.match(css, /\.matrix-guide-screen \.guide-category-strip\s*\{[^}]*margin:\s*8px 4px 6px;[^}]*padding:\s*3px 0;[^}]*border-top:\s*1px solid[^}]*border-bottom:\s*1px solid[^}]*scroll-padding-inline:\s*20px;[^}]*scroll-snap-type:\s*x proximity;[^}]*-webkit-overflow-scrolling:\s*touch;[^}]*touch-action:\s*pan-x pan-y;/s);
  assert.match(css, /\.matrix-guide-screen \.guide-category-strip \.guide-category-card\s*\{[^}]*flex:\s*0 0 auto;[^}]*width:\s*max-content;[^}]*min-height:\s*30\.888px;[^}]*padding:\s*5\.616px 11\.232px;[^}]*grid-template-columns:\s*auto auto;[^}]*gap:\s*5\.616px;[^}]*white-space:\s*nowrap;[^}]*font-size:\s*16\.848px;[^}]*font-weight:\s*700;/s);
  assert.match(css, /\.matrix-guide-screen \.guide-category-strip \.guide-category-card > span\s*\{[^}]*color:\s*#c49145;[^}]*font-size:\s*11\.88px;[^}]*font-weight:\s*800;/s);
  assert.match(css, /\.matrix-guide-screen \.guide-preview\s*\{[^}]*margin-top:\s*0;/s);
});

test("Matrix 指南移除半速指標攔截並使用原生橫向慣性", () => {
  const guideStart = source.indexOf("export function MatrixGuidePage");
  const guideEnd = source.indexOf("export function MatrixNotebookPage", guideStart);
  const guidePage = source.slice(guideStart, guideEnd);

  assert.ok(guideStart >= 0 && guideEnd > guideStart);
  assert.doesNotMatch(guidePage, /GUIDE_DRAG_RATE|GUIDE_DRAG_THRESHOLD|guideDragRef|guideSuppressClickRef/);
  assert.doesNotMatch(guidePage, /onPointerDown=|onPointerMove=|onPointerUp=|onPointerCancel=/);
  assert.match(guidePage, /strip\.addEventListener\("scroll", handleScroll, \{ passive: true \}\)/);
  assert.match(guidePage, /onClick=\{selectGuideCategory\}/);
  assert.match(guidePage, /data-guide-index=\{index\}/);
});
