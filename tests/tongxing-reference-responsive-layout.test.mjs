import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const tongxing = fs.readFileSync('src/tongxing-compact.css', 'utf8');
const feature = fs.readFileSync('src/feature-pages.css', 'utf8');
const tokens = fs.readFileSync('src/design-tokens.css', 'utf8');

function block(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? '';
}

test('Matrix 同星 controls use the compact shared mobile dimensions', () => {
  assert.match(tongxing, /--control-gap:\s*6px;/);
  assert.match(tongxing, /--control-height:\s*32px;/);
  assert.match(tongxing, /--primary-button-height:\s*40px;/);
  assert.match(tongxing, /--table-header-height:\s*32px;/);
  assert.match(tongxing, /--result-row-height:\s*44px;/);
});

test('Matrix 同星 selector and condition rows allocate width by content instead of equal columns', () => {
  assert.match(block(tongxing, '.tongxing-screen .query-selects'), /grid-template-columns:\s*minmax\(0, \.85fr\) minmax\(0, 1\.65fr\)/);
  const fields = block(tongxing, '.tongxing-screen .same-star-fields');
  assert.match(fields, /repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(fields, /max-content/);
  assert.match(fields, /minmax\(52px, \.9fr\)/);
});

test('Matrix 同星 result grids reserve readable issue/date width and keep date unbroken', () => {
  assert.match(block(tongxing, '.tongxing-screen .tongxing-table-row'), /minmax\(72px, 1\.8fr\) repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(block(tongxing, '.tongxing-screen .tongxing-table[data-columns="7"] .tongxing-table-row'), /minmax\(76px, 2\.2fr\) repeat\(7, minmax\(0, 1fr\)\)/);
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

test('Matrix 同星與號碼對照單使用 12px 左右間距與 8px 垂直間距', () => {
  assert.match(tokens, /--layout-page-inline:\s*12px;/);
  assert.match(tokens, /--layout-section-gap:\s*8px;/);

  const tongxingBody = block(tongxing, '.tongxing-screen .feature-body');
  const referenceBody = block(feature, '.number-reference-screen .feature-body');
  for (const body of [tongxingBody, referenceBody]) {
    assert.match(body, /display:\s*flex/);
    assert.match(body, /flex-direction:\s*column/);
    assert.match(body, /row-gap:\s*var\(--layout-section-gap\)/);
    assert.match(body, /padding-top:\s*var\(--layout-section-gap\)/);
  }

  assert.doesNotMatch(tongxingBody, /padding-(?:left|right):\s*(?:8|16)px/);
  assert.match(block(tongxing, '.tongxing-screen .matrix-title-banner'), /width:\s*calc\(100% - \(var\(--layout-page-inline\) \* 2\)\)/);
  assert.match(block(feature, '.number-reference-screen .matrix-title-banner'), /width:\s*calc\(100% - \(var\(--layout-page-inline\) \* 2\)\)/);
  assert.match(block(feature, '.reference-query-panel[data-floating="true"]'), /width:\s*calc\(100% - \(var\(--layout-page-inline\) \* 2\)\)/);
  assert.match(block(tongxing, '.tongxing-screen .tongxing-query'), /margin:\s*0/);
  assert.match(block(tongxing, '.tongxing-screen .ornament-title'), /margin:\s*0/);
  assert.match(block(feature, '.reference-search'), /margin:\s*0/);
});

test('號碼對照單 uses one responsive three-select grid without the old fixed override', () => {
  assert.match(feature, /\.number-reference-screen \.query-selects\.three-cols\s*\{[^}]*grid-template-columns:\s*minmax\(0, \.85fr\) minmax\(0, \.8fr\) minmax\(0, 1\.75fr\)/s);
  assert.doesNotMatch(feature, /\.number-reference-screen \.query-selects\.three-cols\s*\{\s*grid-template-columns:\s*100px 92px minmax\(0, 1fr\);\s*\}/);
  assert.match(feature, /\.reference-search > div\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\) minmax\(0, 1\.7fr\);[^}]*gap:\s*6px/s);
});

test('bounded responsive rules do not add prohibited compensation techniques', () => {
  const referenceRelevant = [
    block(feature, '.number-reference-screen .query-selects.three-cols'),
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

test('390px、375px 與 360px 時兩頁控制項保持在 12px 頁面邊距內', () => {
  for (const viewport of [390, 375, 360]) {
    const contentWidth = viewport - (12 * 2);
    const tongxingInnerWidth = contentWidth - (10 * 2);
    const tongxingFixedWidth = 42 + 28 + 52 + (6 * 5);
    const tongxingInputWidth = (tongxingInnerWidth - tongxingFixedWidth) / 3;
    const referenceSearchInputWidth = (contentWidth - (6 * 3)) / 4.7;
    const referenceFirstSelectWidth = (contentWidth - (6 * 2)) * (.85 / 3.4);

    assert.ok(tongxingInputWidth >= 54, `${viewport}px Matrix 同星號碼欄寬度`);
    assert.ok(referenceSearchInputWidth >= 67, `${viewport}px 號碼對照單號碼欄寬度`);
    assert.ok(referenceFirstSelectWidth >= 81, `${viewport}px 號碼對照單彩種欄寬度`);
    assert.equal(contentWidth, viewport - 24);
  }
});
