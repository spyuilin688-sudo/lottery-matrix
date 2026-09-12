import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

const featurePages = readFeaturePagesSource();
const corePages = readFileSync(new URL("../src/FeaturePagesCore.tsx", import.meta.url), "utf8");
const featureCss = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const responsiveCss = readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");
const exploreCss = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");
const adjustmentsCss = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");

test("Matrix 四頁切換器位於設定標題同列並完整呈現外框", () => {
  assert.match(featureCss, /\.matrix-settings-heading\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*space-between;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.matrix-settings-heading \.matrix-page-switcher button\s*\{[^}]*border:\s*1px solid #755329;[^}]*border-radius:\s*clamp\(4px, 1\.2vw, 5px\);/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.matrix-settings-heading \.matrix-page-switcher button::before,[\s\S]*?button::after\s*\{[^}]*display:\s*none;/s);
  assert.doesNotMatch(exploreCss, /\.matrix-explore-main-screen \.matrix-settings-heading \.matrix-page-switcher button::before\s*\{[^}]*background:\s*linear-gradient\([^}]*#f0c44d/s);
  assert.doesNotMatch(exploreCss, /\.matrix-explore-main-screen \.matrix-settings-heading \.matrix-page-switcher img\s*\{\s*clip-path:\s*inherit;/s);
});

test("同星、對照單與歷史的設定按鈕使用同一個位置規格 [header migration]", () => {
  const css = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
  const actions = ruleBodies(css, /^\.product-header__actions$/);
  assert.equal(actions.length, 1);
  assert.match(actions[0], /grid-area:\s*actions;/);
  assert.match(actions[0], /min-width:\s*0;/);
  assert.doesNotMatch(actions[0], /translate|position:\s*absolute/);
  assert.match(featurePages, /className="reference-title-actions title-card-compact-actions"/);
  assert.match(corePages, /className="history-title-actions title-card-compact-actions"/);
  assert.match(corePages, /className="tongxing-title-actions title-card-compact-actions"/);
  assert.doesNotMatch(responsiveCss, /tool-title-actions/);
});

test("重設與刷新在設定按鈕上方保留 4px，且外框高度固定 24px [header migration]", () => {
  assert.match(featurePages, /className="title-card-compact-action reference-refresh-trigger tool-title-reset-trigger"/);
  assert.match(corePages, /className="history-reset-trigger title-card-compact-action tool-title-reset-trigger"/);

  const bodies = ruleBodies(responsiveCss, /^\.title-card-compact-actions$/);
  assert.equal(bodies.length, 1);
  assert.match(bodies[0], /grid-auto-rows:\s*24px;/);
  assert.match(bodies[0], /gap:\s*4px;/);

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

