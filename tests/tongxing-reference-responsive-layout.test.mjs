import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

import { ruleBodies } from './helpers/css-rules.mjs';

const tongxing = fs.readFileSync('src/tongxing-compact.css', 'utf8');
const feature = fs.readFileSync('src/feature-pages.css', 'utf8');
const responsive = fs.readFileSync('src/responsive-feature-pages.css', 'utf8');
const tokens = fs.readFileSync('src/design-tokens.css', 'utf8');
const brandHeader = fs.readFileSync('src/brand-header-unify.css', 'utf8');
const source = fs.readFileSync('src/FeaturePages.tsx', 'utf8');

function block(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return ruleBodies(css, new RegExp(`^${escaped}$`))[0] ?? '';
}

test('Matrix 同星 controls use the compact shared mobile dimensions', () => {
  assert.match(tongxing, /--control-gap:\s*6px;/);
  assert.match(tongxing, /--control-height:\s*26px;/);
  assert.match(tongxing, /--primary-button-height:\s*40px;/);
  assert.match(tongxing, /--table-header-height:\s*26px;/);
  assert.match(tongxing, /--table-row-height:\s*30px;/);
  assert.match(tongxing, /--result-row-height:\s*30px;/);
});

test('Matrix 同星 selector and condition rows allocate width by content instead of equal columns', () => {
  assert.match(block(tongxing, '.tongxing-query .query-selects'), /grid-template-columns:\s*minmax\(0, \.85fr\) minmax\(0, 1\.65fr\)/);
  const fields = block(tongxing, '.tongxing-query .same-star-fields');
  assert.match(fields, /repeat\(3, minmax\(0, \.8fr\)\)/);
  assert.match(fields, /max-content/);
  assert.match(fields, /minmax\(66px, 1\.15fr\)/);
});

test('Matrix 同星 result grids reserve readable issue/date width and keep date unbroken', () => {
  assert.match(block(tongxing, '.tongxing-screen .tongxing-table-row'), /minmax\(58px, 1\.65fr\) repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(block(tongxing, '.tongxing-screen .tongxing-table[data-columns="7"] .tongxing-table-row'), /minmax\(clamp\(56px, 17\.5vw, 68px\), 1\.9fr\) repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(block(tongxing, '.tongxing-screen .tongxing-period-cell strong'), /white-space:\s*nowrap/);
  assert.match(block(tongxing, '.tongxing-screen .tongxing-period-cell time'), /white-space:\s*nowrap/);
  assert.match(block(tongxing, '.tongxing-screen .tongxing-table-row > .tongxing-period-cell'), /grid-template-rows:\s*auto auto/);
});

test('Matrix 同星左欄計算樣式確實將期數與日期分成上下兩列', () => {
  const dom = new JSDOM(`
    <style>${tongxing}</style>
    <main class="tongxing-screen">
      <div class="tongxing-table-row">
        <span class="tongxing-period-cell"><strong>114001</strong><time>2026/08/20</time></span>
      </div>
    </main>
  `);
  const cell = dom.window.document.querySelector('.tongxing-period-cell');
  const style = dom.window.getComputedStyle(cell);

  assert.equal(style.display, 'grid');
  assert.equal(style.gridTemplateRows, 'auto auto');
});

test('Matrix 同星與號碼對照單內容使用共享 16px 外距與響應式垂直間距', () => {
  assert.match(tokens, /--layout-section-gap:\s*8px;/);

  assert.match(responsive, /--tool-page-inline:\s*16px;/);
  const tongxingBody = block(responsive, '.tongxing-screen .feature-body');
  assert.match(tongxingBody, /display:\s*flex/);
  assert.match(tongxingBody, /flex-direction:\s*column/);
  assert.match(tongxingBody, /width:\s*100%/);
  assert.match(tongxingBody, /margin-inline:\s*0/);
  assert.match(tongxingBody, /padding:\s*var\(--tool-section-gap\) var\(--tool-page-inline\) var\(--layout-bottom-nav-clearance\)/);
  assert.match(tongxingBody, /row-gap:\s*var\(--tool-section-gap\)/);

  const referenceBody = block(responsive, '.number-reference-screen .feature-body');
  assert.match(referenceBody, /display:\s*flex/);
  assert.match(referenceBody, /width:\s*100%/);
  assert.match(referenceBody, /margin-inline:\s*0/);
  assert.match(referenceBody, /padding:\s*var\(--tool-section-gap\) var\(--tool-page-inline\) var\(--layout-bottom-nav-clearance\)/);
  assert.match(referenceBody, /row-gap:\s*var\(--tool-section-gap\)/);

  const floatingPanel = block(responsive, '.reference-query-panel[data-floating="true"]');
  assert.match(floatingPanel, /position:\s*fixed/);
  assert.match(floatingPanel, /left:\s*16px/);
  assert.match(floatingPanel, /right:\s*16px/);
  assert.match(floatingPanel, /width:\s*auto/);
  assert.doesNotMatch(floatingPanel, /transform:\s*translateX/);

  assert.match(block(responsive, '.tongxing-query'), /width:\s*100%/);
  assert.match(block(responsive, '.tongxing-query'), /margin:\s*0/);
  assert.match(block(tongxing, '.tongxing-screen .ornament-title'), /margin:\s*0/);
  assert.match(block(feature, '.reference-search'), /margin:\s*0/);
});

test('shared responsive sheet is the final owner of both tool-page content flows', () => {
  assert.match(block(responsive, '.number-reference-screen .feature-body'), /padding:[^;]*var\(--tool-page-inline\)/);
  assert.match(block(responsive, '.tongxing-screen .feature-body'), /padding:[^;]*var\(--tool-page-inline\)/);
  assert.doesNotMatch(tongxing, /\.tongxing-screen \.feature-body\s*\{/);
});

test('Matrix 同星與號碼對照單頁首不受 390px 寬度限制', () => {
  assert.match(
    brandHeader,
    /\.tongxing-screen > \.feature-brand-header,\s*\.number-reference-screen > \.feature-brand-header\s*\{[^}]*width:\s*100%;/s,
  );
});

test('號碼對照單 uses one responsive three-select grid without the old fixed override', () => {
  assert.match(feature, /\.reference-query-panel \.query-selects\.three-cols\s*\{[^}]*grid-template-columns:\s*minmax\(0, \.85fr\) minmax\(0, \.8fr\) minmax\(0, 1\.75fr\)/s);
  assert.doesNotMatch(feature, /\.number-reference-screen \.query-selects\.three-cols\s*\{\s*grid-template-columns:\s*100px 92px minmax\(0, 1fr\);\s*\}/);
  assert.match(feature, /\.reference-search > div\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\) minmax\(0, 1\.7fr\);[^}]*gap:\s*6px/s);
});

test('bounded responsive rules do not add prohibited compensation techniques', () => {
  const referenceRelevant = [
    block(feature, '.number-reference-screen .reference-select'),
    block(feature, '.number-reference-screen .reference-select select'),
    block(feature, '.number-reference-screen .reference-order-select select'),
    block(feature, '.reference-search'),
    block(feature, '.reference-search > div'),
    block(feature, '.reference-search input'),
    block(feature, '.reference-search .gold-button'),
  ].join('\n');

  for (const css of [tongxing, referenceRelevant]) {
    assert.doesNotMatch(css, /!important|zoom\s*:|scale\(|margin(?:-[a-z]+)?\s*:\s*-/);
  }
});

test('號碼對照單的下拉字體與內距只有一個正式規則', () => {
  assert.equal(feature.match(/\.number-reference-screen \.reference-select select\s*\{/g)?.length, 1);
  assert.equal(feature.match(/\.number-reference-screen \.reference-order-select select\s*\{/g)?.length, 1);
});

test('Matrix 同星使用自動網格並由 API 結果渲染鎖定與預測列', () => {
  const fields = block(tongxing, '.tongxing-query .same-star-fields');
  assert.match(fields, /repeat\(3, minmax\(0, \.8fr\)\)/);
  assert.match(fields, /minmax\(66px, 1\.15fr\)/);
  assert.doesNotMatch(fields, /(?:42px|28px|52px)/);

  assert.match(source, /const response = await fetchTongXing\(\{[\s\S]*?lottery,[\s\S]*?numberOrder:[\s\S]*?numbers: normalizedValues,[\s\S]*?futureOffset: periodOffset,/);
  assert.match(source, /resultGroups\.map\(\(\{ lockedEntry, predictedEntry \}\) =>/);
  assert.match(source, /renderResultRow\(lockedEntry, "locked"\)/);
  assert.match(source, /renderResultRow\(predictedEntry, "predicted"\)/);
});
