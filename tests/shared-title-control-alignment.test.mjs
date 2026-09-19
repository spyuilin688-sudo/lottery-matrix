import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

const corePages = readFileSync(new URL("../src/FeaturePagesCore.tsx", import.meta.url), "utf8");
const featureCss = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const responsiveCss = readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");
const exploreCss = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");
const adjustmentsCss = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");

test("Matrix 五頁切換器位於設定標題同列且外框只有一個來源", () => {
  assert.match(featureCss, /\.matrix-settings-heading\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*space-between;/s);
  const switcher = ruleBodies(featureCss, /^\.matrix-page-switcher$/);
  assert.equal(switcher.length, 1);
  assert.match(switcher[0], /width:\s*176px;[^}]*height:\s*26px;/s);
  assert.match(switcher[0], /border:\s*1px solid var\(--pwa-frame-tertiary\);/);
  assert.match(switcher[0], /border-radius:\s*var\(--pwa-frame-radius\);/);
  assert.doesNotMatch(exploreCss, /matrix-page-switcher/);
});

test("同星、對照單與歷史的設定按鈕共用標題右下定位", () => {
  const actions = ruleBodies(featureCss, /^\.product-header__actions$/);
  assert.equal(actions.length, 1);
  assert.match(actions[0], /position:\s*absolute;[^}]*right:\s*4px;[^}]*bottom:\s*0px;/s);
  assert.match(actions[0], /min-width:\s*0;/);
  assert.match(actions[0], /width:\s*var\(--product-header-action-width\);/);
  assert.doesNotMatch(actions[0], /translate/);
  const reference = readFileSync(new URL('../src/features/NumberReferencePage.tsx', import.meta.url), 'utf8');
  for (const [source, ids] of [[reference, ['reference']], [corePages, ['history', 'tongxing']]]) {
    for (const id of ids) {
      assert.ok(source.includes(`controls="${id}-header-settings"`));
      assert.ok(source.includes(`headerSettings={{ id: "${id}-header-settings"`));
    }
  }
  assert.doesNotMatch(responsiveCss, /tool-title-actions/);
});

test("重設與刷新位於設定第一列並共用 26px 控制與 10px 圖示", () => {
  const reference = readFileSync(new URL('../src/features/NumberReferencePage.tsx', import.meta.url), 'utf8');
  assert.match(reference, /className="tool-settings-reset reference-refresh-trigger"/);
  assert.match(corePages, /className="tool-settings-reset history-reset-trigger"/);
  const reset = ruleBodies(responsiveCss, /^\.tool-settings-reset$/);
  assert.equal(reset.length, 1);
  assert.match(reset[0], /height:\s*26px;/);
  assert.match(reset[0], /font-size:\s*10px;/);
  const icon = ruleBodies(responsiveCss, /^\.tool-settings-reset > svg$/);
  assert.equal(icon.length, 1);
  assert.match(icon[0], /width:\s*10px;/);
  assert.match(icon[0], /height:\s*10px;/);
  assert.match(reference, /className="query-selects three-cols tool-settings-primary-row">[\s\S]*?className="tool-settings-reset reference-refresh-trigger"/);
  assert.match(corePages, /className="history-filter-primary-row tool-settings-primary-row">[\s\S]*?className="tool-settings-reset history-reset-trigger"/);
});

test("指南章節捲動列上下以 3px 間距保留分隔線", () => {
  const bodies = ruleBodies(adjustmentsCss, /^\.matrix-guide-screen \.guide-category-strip$/);
  assert.equal(bodies.length, 1);
  assert.match(bodies[0], /padding:\s*3px 0;/);
  assert.match(bodies[0], /border-top:\s*1px solid/);
  assert.match(bodies[0], /border-bottom:\s*1px solid/);
});

