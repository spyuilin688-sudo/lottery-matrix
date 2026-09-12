import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

const css = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");
const source = readFeaturePagesSource();

test("探索、天衍、天工共用固定尺寸的 Logo 標題卡 [header migration]", () => {
  const headerCss = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
  const card = ruleBodies(headerCss, /^\.product-header__frame$/);
  assert.equal(card.length, 1);
  assert.match(card[0], /height:\s*68px;/);
  assert.match(card[0], /width:\s*100%;/);
  assert.match(source, /<BrandHeader/);
  assert.doesNotMatch(css, /matrix-title-banner/);
});

test("三頁標題圖都填入相同卡片畫布 [header migration]", () => {
  const headerCss = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
  const artwork = ruleBodies(headerCss, /^\.product-header__mark$/);
  assert.equal(artwork.length, 1);
  assert.match(artwork[0], /width:\s*56px;/);
  assert.match(artwork[0], /height:\s*48px;/);
  assert.match(artwork[0], /object-fit:\s*contain;/);
});

