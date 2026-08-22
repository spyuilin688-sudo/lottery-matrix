import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const featureSource = readFileSync(new URL('../src/FeaturePages.tsx', import.meta.url), 'utf8');
const prototypeSource = readFileSync(new URL('../src/Prototype.tsx', import.meta.url), 'utf8');
const brandSource = readFileSync(new URL('../src/BrandLogo.tsx', import.meta.url), 'utf8');
const featureCss = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
const ballCss = readFileSync(new URL('../src/number-ball.css', import.meta.url), 'utf8');

test('歷史開獎卡共用近10期的正式表格結構與響應範圍', () => {
  assert.match(featureSource, /className="matrix-explore-main-screen draw-history-history-scope"/);
  assert.match(featureSource, /className="panel history-panel draw-history-panel"/);
  assert.match(featureSource, /className="history-row draw-history-row history-head draw-history-head"/);
  assert.match(featureSource, /className="history-row draw-history-row"/);
  assert.doesNotMatch(featureCss, /\.draw-history-row\s*\{[^}]*height:\s*54px/s);
  assert.doesNotMatch(featureCss, /\.draw-history-row\s*\{[^}]*grid-template-columns:\s*62px 72px/s);
  assert.doesNotMatch(ballCss, /\.draw-history-screen \.draw-history-row \.number-ball-component\.history-lottery-ball\s*\{/);
});

test('歷史篩選沿用探索設定的圖示與選項尺寸類別', () => {
  assert.match(featureSource, /className="filter-sheet history-filter-sheet matrix-explore-main-screen"/);
  assert.match(featureSource, /className="setting-label-icon matrix-explore-setting-icon"/);
  assert.match(featureSource, /className="history-range-options segmented/);
  assert.doesNotMatch(featureCss, /\.history-filter-icon\s*\{[^}]*width:\s*52px[^}]*height:\s*52px/s);
  assert.doesNotMatch(featureCss, /\.history-range-options button\s*\{[^}]*min-height:\s*40px/s);
});

test('篩選條件按鈕固定在歷史標題卡右下角', () => {
  assert.match(featureCss, /\.draw-history-screen \.matrix-title-banner-actions\s*\{[^}]*right:\s*4%[^}]*bottom:\s*8%/s);
  assert.match(featureCss, /\.draw-history-screen \.matrix-title-banner-actions \.history-title-actions\s*\{[^}]*align-items:\s*flex-end/s);
});

test('未設定快捷功能時點擊快捷會開啟既有設定', () => {
  assert.match(prototypeSource, /if \(!quickTarget\) \{ setQuickSettingsOpen\(true\); return; \}/);
});

test('底部導覽三頁的共用頁首使用首頁 matrixya Logo', () => {
  assert.match(brandSource, /PRIMARY_BRAND_LOGO\s*=\s*"\/assets\/lottery\/functions\/matrixya\.png"/);
});
