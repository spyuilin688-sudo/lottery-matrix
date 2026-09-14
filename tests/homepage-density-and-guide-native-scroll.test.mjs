import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const homeCss = readLocalCss("src/homepage-repair.css");
const guideCss = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");
const guideSource = readFeaturePagesSource();
const matrixGuideStart = guideSource.indexOf("export function MatrixGuidePage");
const matrixGuideEnd = guideSource.indexOf("export function MatrixNotebookPage", matrixGuideStart);
const matrixGuideSource = guideSource.slice(matrixGuideStart, matrixGuideEnd);

test("首頁 Logo 等比例填滿正式框", () => {
  assert.match(homeCss, /\.home-screen \.home-logo-image\s*\{[^}]*width:\s*100%;/s);
});

test("順球與落球上移 2px且總高度縮減 3px", () => {
  assert.match(
    homeCss,
    /\.home-screen \.latest-draw-card \.draw-order\s*\{[^}]*height:\s*25px;[^}]*margin-block-start:\s*1px;/s,
  );
});

test("開獎資訊卡底部資訊列使用無縫鑲嵌框", () => {
  assert.match(
    homeCss,
    /\.home-screen \.latest-draw-card \.next-draw-info--embedded\s*\{[^}]*gap:\s*0;/s,
  );
  assert.match(
    homeCss,
    /\.home-screen \.latest-draw-card \.next-draw-info--embedded \.next-draw-item\s*\{[^}]*gap:\s*4px;[^}]*padding-inline:\s*clamp\(6px, 2vw, 10px\);/s,
  );
  assert.doesNotMatch(homeCss, /\.next-draw-item:first-child\s*\{|\.next-draw-item:last-child\s*\{/s);
  assert.match(
    homeCss,
    /\.home-screen \.latest-draw-card \.history-link\s*\{[^}]*gap:\s*2px;/s,
  );
});

test("Matrix 指南只使用原生橫向滑動並保留循環校正", () => {
  assert.ok(matrixGuideStart >= 0 && matrixGuideEnd > matrixGuideStart);
  assert.doesNotMatch(matrixGuideSource, /GUIDE_DRAG_RATE|GUIDE_DRAG_THRESHOLD|guideDragRef|guideSuppressClickRef/);
  assert.doesNotMatch(matrixGuideSource, /onPointerDown=|onPointerMove=|onPointerUp=|onPointerCancel=/);
  assert.match(matrixGuideSource, /strip\.addEventListener\("scroll", handleScroll, \{ passive: true \}\)/);
  assert.match(matrixGuideSource, /closest<HTMLElement>\("\[data-guide-index\]"\)/);
  assert.match(matrixGuideSource, /onClick=\{selectGuideCategory\}/);
  assert.match(
    guideCss,
    /\.matrix-guide-screen \.guide-category-strip\s*\{[^}]*overflow-x:\s*auto;[^}]*-webkit-overflow-scrolling:\s*touch;[^}]*touch-action:\s*pan-x pan-y;/s,
  );
});
