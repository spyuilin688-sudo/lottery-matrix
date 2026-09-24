import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

const source = readFeaturePagesSource();
const adjustments = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");
const featurePages = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const guideStart = source.indexOf("export function MatrixGuidePage");
const guideEnd = source.indexOf("export function MatrixNotebookPage", guideStart);
const guideSource = source.slice(guideStart, guideEnd);

test("Matrix 指南章節列保留上下分隔線並收斂章節卡層級", () => {
  const strip = ruleBodies(adjustments, /^\.matrix-guide-screen \.guide-category-strip$/);
  const card = ruleBodies(adjustments, /^\.matrix-guide-screen \.guide-category-strip \.guide-category-card$/);
  const selected = ruleBodies(adjustments, /^\.matrix-guide-screen \.guide-category-strip \.guide-category-card\[data-selected="true"\]$/);
  const number = ruleBodies(adjustments, /^\.matrix-guide-screen \.guide-category-strip \.guide-category-card > span$/);

  assert.equal(strip.length, 1);
  assert.match(strip[0], /margin:\s*0 4px 6px;/);
  assert.match(strip[0], /padding:\s*3px 0;/);
  assert.match(strip[0], /border-top:\s*1px solid var\(--pwa-frame-divider\);/);
  assert.match(strip[0], /border-bottom:\s*1px solid var\(--pwa-frame-divider\);/);
  assert.doesNotMatch(strip[0], /scrollbar-(?:color|width)/);
  assert.doesNotMatch(adjustments, /\.matrix-guide-screen \.guide-category-strip::\-webkit-scrollbar/);

  assert.equal(card.length, 1);
  assert.match(card[0], /min-height:\s*30\.888px;/);
  assert.match(card[0], /padding:\s*5px 9px;/);
  assert.match(card[0], /gap:\s*5px;/);
  assert.match(card[0], /font-size:\s*14px;/);
  assert.match(card[0], /font-weight:\s*600;/);

  assert.equal(selected.length, 1);
  assert.match(selected[0], /font-weight:\s*700;/);

  assert.equal(number.length, 1);
  assert.match(number[0], /font-size:\s*11\.88px;/);
  assert.match(number[0], /font-weight:\s*800;/);
});

test("Matrix 指南標題、內容卡與內文維持清楚層級", () => {
  const preview = ruleBodies(adjustments, /^\.matrix-guide-screen \.guide-preview$/);
  const headerNumber = ruleBodies(adjustments, /^\.matrix-guide-screen \.guide-preview header > span$/);
  const title = ruleBodies(adjustments, /^\.matrix-guide-screen \.guide-preview h2$/);
  const summary = ruleBodies(adjustments, /^\.matrix-guide-screen \.guide-preview \.guide-summary$/);
  const detailBlock = ruleBodies(adjustments, /^\.matrix-guide-screen \.guide-detail-block$/);
  const bullet = ruleBodies(adjustments, /^\.matrix-guide-screen \.guide-detail-block li::before$/);
  const copy = ruleBodies(adjustments, /^\.matrix-guide-screen \.guide-preview :is\(\.guide-summary, \.guide-detail-block ul\)$/);

  assert.equal(preview.length, 1);
  assert.match(preview[0], /margin-top:\s*0;/);
  assert.match(preview[0], /border-color:\s*var\(--pwa-frame-tertiary\);/);

  assert.equal(headerNumber.length, 1);
  assert.match(headerNumber[0], /width:\s*18px;/);
  assert.match(headerNumber[0], /height:\s*18px;/);
  assert.match(headerNumber[0], /border-radius:\s*50%;/);
  assert.match(headerNumber[0], /font-size:\s*10px;/);
  assert.match(headerNumber[0], /color:\s*#c49145;/);

  assert.equal(title.length, 1);
  assert.match(title[0], /color:\s*#f4ce67;/);
  assert.match(title[0], /font-size:\s*18px;/);

  assert.equal(summary.length, 1);
  assert.match(summary[0], /line-height:\s*1\.68;/);
  assert.match(summary[0], /border-bottom:\s*1px solid color-mix\(in srgb, var\(--pwa-frame-divider\) 60%, transparent\);/);

  assert.equal(detailBlock.length, 1);
  assert.match(detailBlock[0], /border-bottom:\s*1px solid color-mix\(in srgb, var\(--pwa-frame-divider\) 60%, transparent\);/);

  assert.equal(bullet.length, 1);
  assert.match(bullet[0], /background:\s*var\(--pwa-frame-tertiary\);/);

  assert.equal(copy.length, 1);
  assert.match(copy[0], /font-family:\s*"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;/);
  assert.doesNotMatch(featurePages, /^\.guide-preview/m);
});
