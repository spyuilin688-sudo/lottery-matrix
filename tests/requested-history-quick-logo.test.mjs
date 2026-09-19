import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { ruleBodies } from './helpers/css-rules.mjs';

const featureSource = readFileSync(new URL('../src/FeaturePagesCore.tsx', import.meta.url), 'utf8');
const prototypeSource = readFileSync(new URL('../src/Prototype.tsx', import.meta.url), 'utf8');
const featureCss = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
const ballCss = readFileSync(new URL('../src/number-ball.css', import.meta.url), 'utf8');
const responsiveCss = readFileSync(new URL('../src/responsive-feature-pages.css', import.meta.url), 'utf8');
const brandCss = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');

test('歷史開獎卡共用近10期的正式表格結構與響應範圍', () => {
  assert.match(featureSource, /className="matrix-explore-main-screen draw-history-history-scope"/);
  assert.match(featureSource, /className="panel history-panel draw-history-panel"/);
  assert.match(featureSource, /className="history-row draw-history-row history-head draw-history-head"/);
  assert.match(featureSource, /className="history-row draw-history-row"/);
  assert.doesNotMatch(featureCss, /\.draw-history-row\s*\{[^}]*height:\s*54px/s);
  assert.doesNotMatch(featureCss, /\.draw-history-row\s*\{[^}]*grid-template-columns:\s*62px 72px/s);
  assert.doesNotMatch(ballCss, /\.draw-history-screen \.draw-history-row \.number-ball-component\.history-lottery-ball\s*\{/);
});

test('歷史篩選使用目前的原生下拉網格與正式開始探索操作', () => {
  assert.match(featureSource, /className="history-filter-panel tool-settings-panel"/);
  assert.match(featureSource, /className="history-filter-primary-row tool-settings-primary-row"/);
  assert.match(featureSource, /className="history-filter-secondary-row"/);
  assert.match(featureSource, /className="history-filter-start branded-explore-action"/);
  assert.doesNotMatch(featureSource, /className="filter-sheet history-filter-sheet matrix-explore-main-screen"/);
  assert.doesNotMatch(featureSource, /className="history-range-options segmented/);
  assert.doesNotMatch(featureCss, /\.history-filter-icon\s*\{[^}]*width:\s*52px[^}]*height:\s*52px/s);
  assert.doesNotMatch(featureCss, /\.history-range-options button\s*\{[^}]*min-height:\s*40px/s);
});

test('篩選設定按鈕由標題卡內容寬度控制器定位 [header migration]', () => {
  const css = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
  const actions = ruleBodies(css, /^\.product-header__actions$/);
  assert.equal(actions.length, 1);
  assert.match(actions[0], /position:\s*absolute;/);
  assert.match(actions[0], /right:\s*4px;/);
  assert.match(actions[0], /bottom:\s*0px;/);
  assert.match(actions[0], /width:\s*var\(--product-header-action-width\);/);
  assert.match(actions[0], /min-width:\s*0;/);
  assert.doesNotMatch(actions[0], /translate/);
});

test('歷史篩選沿用共用 24px 無外框設定按鈕', () => {
  assert.match(featureSource, /<HeaderSettingsButton expanded=\{filterExpanded\} controls="history-header-settings" label="篩選設定"/);
  const dom = new JSDOM(`
    <style>${featureCss}\n${responsiveCss}</style>
    <main class="draw-history-screen">
      <button class="product-header__settings-toggle" aria-expanded="false" aria-controls="history-header-settings">篩選設定</button>
    </main>
  `);
  const button = dom.window.document.querySelector('.product-header__settings-toggle');
  const style = dom.window.getComputedStyle(button);

  assert.equal(style.height, '24px');
  assert.equal(style.fontSize, '12px');
  assert.equal(style.borderWidth, '0px');
  assert.equal(style.backgroundColor, 'rgba(0, 0, 0, 0)');
  dom.window.close();
});

test('未設定快捷功能時點擊快捷會開啟既有設定', () => {
  assert.match(prototypeSource, /if \(!quickTarget\) \{ setQuickSettingsOpen\(true\); return; \}/);
});

test('功能頁共用 matrixYY Logo 與標題卡外距 [header migration]', () => {
  const header = readFileSync(new URL('../src/features/BrandHeader.tsx', import.meta.url), 'utf8');
  assert.match(header, /matrixYY\.png/);
  assert.match(brandCss, /\.product-header\s*\{[^}]*width:\s*100%;[^}]*padding:\s*0 var\(--layout-page-inline\);[^}]*margin-bottom:\s*var\(--layout-section-gap\);/s);
  assert.match(brandCss, /\.product-header__mark\s*\{[^}]*width:\s*56px;[^}]*height:\s*48px;/s);
});
