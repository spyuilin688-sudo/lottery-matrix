import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

const referencePage = readFileSync(new URL("../src/features/NumberReferencePage.tsx", import.meta.url), "utf8");
const corePages = readFileSync(new URL("../src/FeaturePagesCore.tsx", import.meta.url), "utf8");
const featureCss = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const responsiveCss = readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");
const exploreCss = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");
const adjustmentsCss = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");

test("Matrix 四頁切換器位於設定標題同列並完整呈現外框", () => {
  assert.match(featureCss, /\.matrix-settings-heading\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*space-between;/s);
  const switcher = ruleBodies(featureCss, /^\.matrix-page-switcher$/);
  assert.equal(switcher.length, 1);
  assert.match(switcher[0], /width:\s*176px;/);
  assert.match(switcher[0], /height:\s*26px;/);
  assert.match(switcher[0], /border:\s*1px solid var\(--pwa-frame-tertiary\);/);
  assert.match(switcher[0], /border-radius:\s*var\(--pwa-frame-radius\);/);
  assert.match(switcher[0], /overflow:\s*hidden;/);
  assert.doesNotMatch(exploreCss, /\.matrix-page-switcher/);
  assert.doesNotMatch(featureCss, /\.matrix-page-switcher[^{}]*::(?:before|after)/);
});

test("同星、對照單與歷史的設定按鈕使用同一個位置規格 [header migration]", () => {
  const css = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
  const actions = ruleBodies(css, /^\.product-header__actions$/);
  assert.equal(actions.length, 1);
  assert.match(actions[0], /position:\s*absolute;[^}]*right:\s*4px;[^}]*bottom:\s*0px;/s);
  assert.match(actions[0], /width:\s*var\(--product-header-action-width\);/);
  assert.match(actions[0], /min-width:\s*0;/);
  assert.doesNotMatch(actions[0], /translate/);
  assert.match(referencePage, /<HeaderSettingsButton[^>]*controls="reference-header-settings"/);
  assert.match(corePages, /<HeaderSettingsButton[^>]*controls="history-header-settings"/);
  assert.match(corePages, /<HeaderSettingsButton[^>]*controls="tongxing-header-settings"/);
  assert.match(css, /--product-header-settings-action-width:\s*70px;/);
  assert.doesNotMatch(responsiveCss, /tool-title-actions/);
});

test("重設與刷新位於設定第一列並共用 26px 高度與 10px 圖示 [header migration]", () => {
  const historyRow = corePages.slice(corePages.indexOf('className="history-filter-primary-row tool-settings-primary-row"'), corePages.indexOf('className="history-filter-secondary-row"'));
  const referenceRow = referencePage.slice(referencePage.indexOf('className="query-selects three-cols tool-settings-primary-row"'), referencePage.indexOf('<section className="reference-search"'));
  assert.match(referenceRow, /className="tool-settings-reset reference-refresh-trigger" onClick=\{resetReference\}/);
  assert.match(historyRow, /className="tool-settings-reset history-reset-trigger" onClick=\{resetHistory\}/);
  assert.doesNotMatch(corePages + referencePage, /tool-title-reset-trigger/);

  const bodies = ruleBodies(responsiveCss, /^\.tool-settings-reset$/);
  assert.equal(bodies.length, 1);
  assert.match(bodies[0], /height:\s*26px;/);
  assert.match(bodies[0], /font-size:\s*10px;/);
  assert.match(featureCss, /\.history-filter-primary-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, \.85fr\) minmax\(0, 1\.85fr\) 52px;/);
  assert.match(featureCss, /\.reference-query-panel \.query-selects\.three-cols\s*\{[^}]*grid-template-columns:\s*minmax\(0, \.95fr\) minmax\(0, \.8fr\) minmax\(0, 1\.75fr\) 42px;/);

  const refreshIcon = ruleBodies(responsiveCss, /^\.tool-settings-reset > svg$/);
  assert.equal(refreshIcon.length, 1);
  assert.match(refreshIcon[0], /width:\s*10px;/);
  assert.match(refreshIcon[0], /height:\s*10px;/);
});

test("指南章節捲動列上下以 3px 間距保留分隔線", () => {
  const bodies = ruleBodies(adjustmentsCss, /^\.matrix-guide-screen \.guide-category-strip$/);
  assert.equal(bodies.length, 1);
  assert.match(bodies[0], /padding:\s*3px 0;/);
  assert.match(bodies[0], /border-top:\s*1px solid/);
  assert.match(bodies[0], /border-bottom:\s*1px solid/);
});
