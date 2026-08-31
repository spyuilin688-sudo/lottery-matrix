import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const adjustments = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");
const featurePages = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const guideStart = source.indexOf("export function MatrixGuidePage");
const guideEnd = source.indexOf("export function MatrixNotebookPage", guideStart);
const guideSource = source.slice(guideStart, guideEnd);

test("Matrix 指南說明自訂觸發條件按鈕的位置與開啟方式", () => {
  assert.match(
    guideSource,
    /title: "自訂觸發條件", items: \[[^\]]*在 Matrix 狀態頁面，連續點擊右下角設定按鈕兩下，即可開啟「Matrix 自訂觸發狀態」。/s,
  );
});

test("Matrix 指南章節卡縮小並與上下分隔線保留 1.5px", () => {
  const strip = ruleBodies(adjustments, /^\.matrix-guide-screen \.guide-category-strip$/);
  const card = ruleBodies(adjustments, /^\.matrix-guide-screen \.guide-category-strip \.guide-category-card$/);
  const number = ruleBodies(adjustments, /^\.matrix-guide-screen \.guide-category-strip \.guide-category-card > span$/);

  assert.equal(strip.length, 1);
  assert.match(strip[0], /margin:\s*8px 4px 6px;/);
  assert.match(strip[0], /padding:\s*1\.5px 0;/);
  assert.doesNotMatch(strip[0], /scrollbar-(?:color|width)/);
  assert.doesNotMatch(adjustments, /\.matrix-guide-screen \.guide-category-strip::\-webkit-scrollbar/);

  assert.equal(card.length, 1);
  assert.match(card[0], /min-height:\s*30\.888px;/);
  assert.match(card[0], /padding:\s*5\.616px 11\.232px;/);
  assert.match(card[0], /gap:\s*5\.616px;/);
  assert.match(card[0], /font-size:\s*16\.848px;/);

  assert.equal(number.length, 1);
  assert.match(number[0], /font-size:\s*11\.88px;/);
  assert.match(number[0], /font-weight:\s*800;/);
});

test("Matrix 指南標題、編號與內文維持清楚層級", () => {
  const preview = ruleBodies(adjustments, /^\.matrix-guide-screen \.guide-preview$/);
  const headerNumber = ruleBodies(adjustments, /^\.matrix-guide-screen \.guide-preview header > span$/);
  const title = ruleBodies(adjustments, /^\.matrix-guide-screen \.guide-preview h2$/);
  const copy = ruleBodies(adjustments, /^\.matrix-guide-screen \.guide-preview :is\(\.guide-summary, \.guide-detail-block ul\)$/);

  assert.equal(preview.length, 1);
  assert.match(preview[0], /margin-top:\s*0;/);

  assert.equal(headerNumber.length, 1);
  assert.match(headerNumber[0], /width:\s*18px;/);
  assert.match(headerNumber[0], /height:\s*18px;/);
  assert.match(headerNumber[0], /border-radius:\s*50%;/);
  assert.match(headerNumber[0], /font-size:\s*10px;/);
  assert.match(headerNumber[0], /color:\s*#c49145;/);

  assert.equal(title.length, 1);
  assert.match(title[0], /color:\s*#f4ce67;/);
  assert.match(title[0], /font-size:\s*18px;/);

  assert.equal(copy.length, 1);
  assert.match(copy[0], /font-family:\s*"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;/);
  assert.doesNotMatch(featurePages, /^\.guide-preview/m);
});
