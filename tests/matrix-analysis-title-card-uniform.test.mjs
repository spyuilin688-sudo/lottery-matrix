import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

const css = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");
const source = readFeaturePagesSource();

test("探索、天衍、天工共用固定尺寸的 Logo 標題卡", () => {
  assert.match(source, /current=\{isTianheng \? "tianheng" : isTianyan \? "tianyan" : "explore"\}/);
  assert.match(source, /className="matrix-explore-screen matrix-explore-main-screen matrix-explore-layout matrix-tiangong-screen"/);

  const card = ruleBodies(css, /^\.matrix-explore-main-screen \.matrix-title-banner$/);
  assert.equal(card.length, 1);
  assert.match(card[0], /--matrix-analysis-title-card-ratio:\s*2162\s*\/\s*510;/);
  assert.match(card[0], /aspect-ratio:\s*var\(--matrix-analysis-title-card-ratio\);/);
});

test("三頁標題圖都填入相同卡片畫布", () => {
  const artwork = ruleBodies(css, /^\.matrix-explore-main-screen \.matrix-title-banner > img$/);
  assert.equal(artwork.length, 1);
  assert.match(artwork[0], /width:\s*100%;/);
  assert.match(artwork[0], /height:\s*100%;/);
  assert.match(artwork[0], /object-fit:\s*fill;/);
});
