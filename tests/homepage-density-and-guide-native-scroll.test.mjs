import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homeCss = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");
const guideCss = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");
const guideSource = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const matrixGuideStart = guideSource.indexOf("export function MatrixGuidePage");
const matrixGuideEnd = guideSource.indexOf("export function MatrixNotebookPage", matrixGuideStart);
const matrixGuideSource = guideSource.slice(matrixGuideStart, matrixGuideEnd);

test("首頁 Logo 等比例縮小 8%", () => {
  assert.match(homeCss, /\.home-screen \.home-logo-image\s*\{[^}]*width:\s*87\.584%;/s);
});

test("順球與落球上移 2px且總高度縮減 3px", () => {
  assert.match(
    homeCss,
    /\.home-screen \.latest-draw-card \.draw-order\s*\{[^}]*height:\s*25px;[^}]*margin-block-start:\s*1px;/s,
  );
});

test("開獎資訊卡底部資訊列使用指定內距與 0.5px 間距", () => {
  assert.match(
    homeCss,
    /\.home-screen \.latest-draw-card \.next-draw-info--embedded\s*\{[^}]*gap:\s*3px;/s,
  );
  assert.match(
    homeCss,
    /\.home-screen \.latest-draw-card \.next-draw-info--embedded \.next-draw-item\s*\{[^}]*gap:\s*4px;[^}]*padding-inline:\s*clamp\(6px, 2vw, 10px\);/s,
  );
  assert.doesNotMatch(homeCss, /\.next-draw-item:first-child\s*\{|\.next-draw-item:last-child\s*\{/s);
  assert.match(
    homeCss,
    /\.home-screen \.latest-draw-card \.history-link\s*\{[^}]*gap:\s*0\.5px;/s,
  );
});

test("Matrix 指南只使用原生橫向滑動並保留循環校正", () => {
  assert.ok(matrixGuideStart >= 0 && matrixGuideEnd > matrixGuideStart);
  assert.doesNotMatch(matrixGuideSource, /GUIDE_DRAG_RATE|GUIDE_DRAG_THRESHOLD|guideDragRef|guideSuppressClickRef/);
  assert.doesNotMatch(matrixGuideSource, /onPointerDown=|onPointerMove=|onPointerUp=|onPointerCancel=/);
  assert.match(matrixGuideSource, /strip\.addEventListener\("scroll", handleScroll, \{ passive: true \}\)/);
  assert.match(matrixGuideSource, /onClick=\{selectGuideCategory\}/);
  assert.match(matrixGuideSource, /data-guide-index=\{index\}/);
  assert.match(
    guideCss,
    /\.matrix-guide-screen \.guide-category-strip\s*\{[^}]*overflow-x:\s*auto;[^}]*-webkit-overflow-scrolling:\s*touch;[^}]*touch-action:\s*pan-x pan-y;/s,
  );
});
