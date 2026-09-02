import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

const featurePages = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const corePages = readFileSync(new URL("../src/FeaturePagesCore.tsx", import.meta.url), "utf8");
const featureCss = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const responsiveCss = readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");
const exploreCss = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");
const adjustmentsCss = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");

test("Matrix 三頁切換器維持位置並隱藏外框", () => {
  assert.match(featureCss, /\.matrix-explore-screen \.matrix-title-banner-actions\s*\{[^}]*left:\s*calc\(83% \+ 3px\);/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.matrix-title-banner-actions \.matrix-page-switcher button\s*\{[^}]*border:\s*0;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.matrix-title-banner-actions \.matrix-page-switcher button::before,[\s\S]*?button::after\s*\{[^}]*display:\s*none;/s);
  assert.doesNotMatch(exploreCss, /\.matrix-explore-main-screen \.matrix-title-banner-actions \.matrix-page-switcher button::before\s*\{[^}]*background:\s*linear-gradient\([^}]*#f0c44d/s);
  assert.doesNotMatch(exploreCss, /\.matrix-explore-main-screen \.matrix-title-banner-actions \.matrix-page-switcher img\s*\{\s*clip-path:\s*inherit;/s);
});

test("同星、對照單與歷史的設定按鈕使用同一個位置規格", () => {
  assert.match(featurePages, /className="reference-title-actions title-card-compact-actions tool-title-actions"/);
  assert.match(corePages, /className="history-title-actions title-card-compact-actions tool-title-actions"/);
  assert.match(corePages, /className="tongxing-title-actions title-card-compact-actions tool-title-actions"/);

  const actionBodies = ruleBodies(responsiveCss, /^\.tool-title-actions$/);
  assert.equal(actionBodies.length, 1);
  assert.match(actionBodies[0], /translate:\s*-3px -1px;/);
});

test("重設與刷新在設定按鈕左側保留 6px，且外框高度由同一列伸展", () => {
  assert.match(featurePages, /className="title-card-compact-action reference-refresh-trigger tool-title-reset-trigger"/);
  assert.match(corePages, /className="history-reset-trigger title-card-compact-action tool-title-reset-trigger"/);

  for (const selector of [
    /^\.draw-history-screen \.history-title-actions$/,
    /^\.number-reference-screen \.reference-title-actions$/,
  ]) {
    const bodies = ruleBodies(responsiveCss, selector);
    assert.equal(bodies.length, 1);
    assert.match(bodies[0], /align-items:\s*stretch;/);
    assert.match(bodies[0], /gap:\s*6px;/);
  }

  const refreshIcon = ruleBodies(responsiveCss, /^\.reference-refresh-icon$/);
  assert.equal(refreshIcon.length, 1);
  assert.match(refreshIcon[0], /width:\s*8px;/);
  assert.match(refreshIcon[0], /height:\s*8px;/);
});

test("指南章節捲動列上下以 3px 間距保留分隔線", () => {
  const bodies = ruleBodies(adjustmentsCss, /^\.matrix-guide-screen \.guide-category-strip$/);
  assert.equal(bodies.length, 1);
  assert.match(bodies[0], /padding:\s*3px 0;/);
  assert.match(bodies[0], /border-top:\s*1px solid/);
  assert.match(bodies[0], /border-bottom:\s*1px solid/);
});
