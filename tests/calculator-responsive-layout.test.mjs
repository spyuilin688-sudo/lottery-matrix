import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const feature = fs.readFileSync('src/feature-pages.css', 'utf8');
const prototype = fs.readFileSync('src/prototype.css', 'utf8');
const tokens = fs.readFileSync('src/design-tokens.css', 'utf8');

function block(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return '';
  const bodyStart = css.indexOf('{', start) + 1;
  return css.slice(bodyStart, css.indexOf('}', bodyStart));
}

function calculatorStyles() {
  const dom = new JSDOM(`<!doctype html>
    <style>${tokens}\n${feature}</style>
    <main class="calculator-screen">
      <div class="feature-body">
        <nav class="mode-tabs"><button data-selected="true">連碰</button><button>立柱</button></nav>
        <section class="panel calculator-panel column-panel">
          <header>
            <div class="calculator-heading">
              <div class="section-title"><span></span>連碰設定</div>
              <span class="calculator-summary">計算總數：<strong>1</strong> 個</span>
            </div>
            <div class="calculator-actions"><button class="clear-button"><svg></svg>清除</button></div>
          </header>
          <div class="number-grid"><button>01</button></div>
          <div class="quick-actions"><button>全部設為 2</button><button class="clear-button"><svg></svg>清除</button></div>
          <div class="column-grid"><div><span>第 1 柱</span><button>−</button><strong>1</strong><button>＋</button></div></div>
        </section>
        <section class="panel calculation-results">
          <div class="section-title"><span></span>計算結果</div>
          <div><article><span>二星</span><strong>2</strong></article></div>
        </section>
      </div>
    </main>`);
  const style = (selector) => dom.window.getComputedStyle(dom.window.document.querySelector(selector));
  return { dom, style };
}

test('calculator controls use the approved responsive touch sizes without changing the layout', () => {
  const { dom, style } = calculatorStyles();
  const tabs = style('.mode-tabs');
  const firstTab = style('.mode-tabs button');

  assert.equal(tabs.height, '38px');
  assert.equal(firstTab.height, '36px');
  assert.equal(firstTab.minHeight, '36px');
  assert.equal(firstTab.fontSize, '18px');
  // Internal separators are intentionally quieter than the outer frame.
  assert.match(block(feature, '.calculator-screen .mode-tabs button'), /border-right:\s*1px solid var\(--pwa-frame-divider\)/);

  const panel = block(feature, '.calculator-panel');
  assert.match(panel, /--calculator-number-size:\s*clamp\(36px,\s*calc\(\(100vw - 74px\) \/ 7\),\s*48px\)/);
  assert.match(panel, /--calculator-action-height:\s*clamp\(34px,\s*9\.3vw,\s*40px\)/);
  assert.match(panel, /--calculator-column-control-size:\s*clamp\(30px,\s*9\.3vw,\s*40px\)/);
  assert.match(panel, /--calculator-column-row-height:\s*clamp\(50px,\s*14vw,\s*60px\)/);
  assert.match(panel, /padding:\s*8px clamp\(4px,\s*1\.3vw,\s*6px\) 12px/);
  assert.match(block(feature, '.panel'), /border:\s*1px solid var\(--pwa-frame-secondary\)/);
  assert.match(block(feature, '.calculator-screen > .feature-body'), /padding:\s*0 var\(--layout-page-inline\) var\(--layout-bottom-nav-clearance\)/);
  assert.equal(style('.calculator-screen .feature-body').getPropertyValue('--layout-page-inline'), '16px');
  assert.equal(style('.column-panel').paddingBottom, '4px');
  assert.equal(style('.calculator-screen .section-title').fontSize, '16px');
  assert.match(block(feature, '.calculator-panel > header .calculator-heading > span'), /font-size:\s*clamp\(12px,\s*3\.3vw,\s*14px\)/);

  const headerButton = block(feature, '.calculator-panel header button');
  assert.match(headerButton, /height:\s*var\(--calculator-action-height\)/);
  assert.match(headerButton, /min-height:\s*var\(--calculator-action-height\)/);
  assert.match(headerButton, /font-size:\s*clamp\(12px,\s*3\.3vw,\s*14px\)/);
  const quickButton = block(feature, '.quick-actions button');
  assert.match(quickButton, /height:\s*var\(--calculator-action-height\)/);
  assert.match(quickButton, /font-size:\s*clamp\(12px,\s*3\.3vw,\s*14px\)/);
  assert.match(feature, /\.calculator-panel header button svg,\s*\.quick-actions \.clear-button svg\s*\{[^}]*width:\s*clamp\(10px,\s*2\.8vw,\s*12px\)[^}]*height:\s*clamp\(10px,\s*2\.8vw,\s*12px\)/s);

  assert.equal(style('.calculation-results').paddingTop, '6px');
  assert.equal(style('.calculation-results').paddingRight, '4px');
  assert.equal(style('.calculation-results').paddingBottom, '6px');
  assert.equal(style('.calculation-results').paddingLeft, '4px');
  assert.match(block(feature, '.calculation-results article'), /border:\s*1px solid var\(--pwa-frame-secondary\)/);
  assert.equal(style('.calculation-results article').height, '60px');
  assert.equal(style('.calculation-results article').paddingTop, '6px');
  assert.equal(style('.calculation-results article').paddingBottom, '6px');
  assert.equal(style('.calculation-results article span').fontSize, '16px');
  assert.equal(style('.calculation-results article strong').fontSize, '14px');

  const numberButton = block(feature, '.number-grid button');
  assert.match(numberButton, /width:\s*var\(--calculator-number-size\)/);
  assert.match(numberButton, /height:\s*var\(--calculator-number-size\)/);
  assert.match(numberButton, /font-size:\s*clamp\(14px,\s*4vw,\s*16px\)/);
  const columnButton = block(feature, '.column-grid button');
  assert.match(columnButton, /width:\s*var\(--calculator-column-control-size\)/);
  assert.match(columnButton, /height:\s*var\(--calculator-column-control-size\)/);
  assert.match(columnButton, /font-size:\s*clamp\(18px,\s*5vw,\s*22px\)/);
  dom.window.close();
});

test('calculator uses one fluid width source at 390px, 375px and 360px', () => {
  for (const selector of ['.mode-tabs', '.calculator-panel', '.calculation-results', '.column-grid']) {
    assert.match(block(feature, selector), /width:\s*100%/);
    assert.doesNotMatch(block(feature, selector), /width:\s*(?:340|366)px/);
  }
  assert.doesNotMatch(block(feature, '.calculator-screen > .feature-body'), /overflow-x:\s*hidden/);
});

test('calculator owns a viewport-height shell with independently scrolling content', () => {
  const screen = block(feature, '.calculator-screen');
  assert.match(screen, /display:\s*flex/);
  assert.match(screen, /height:\s*100vh/);
  assert.match(screen, /flex-direction:\s*column/);

  const body = block(feature, '.calculator-screen > .feature-body');
  assert.match(body, /flex:\s*1 1 auto/);
  assert.match(body, /min-height:\s*0/);
  assert.match(body, /overflow-y:\s*auto/);
  assert.match(body, /padding:\s*0 var\(--layout-page-inline\) var\(--layout-bottom-nav-clearance\)/);
  assert.doesNotMatch(body, /80px/);
});

test('calculator settings header separates copy and actions without overlap', () => {
  const header = block(feature, '.calculator-panel > header');
  assert.match(header, /display:\s*flex/);
  assert.match(header, /justify-content:\s*space-between/);
  assert.match(header, /align-items:\s*center/);
});

test('49-number layout keeps seven columns with responsive controls and no horizontal overflow', () => {
  const grid = block(feature, '.number-grid');
  assert.match(grid, /grid-template-columns:\s*repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(grid, /gap:\s*var\(--calculator-grid-gap\)/);

  const button = block(feature, '.number-grid button');
  assert.match(button, /width:\s*var\(--calculator-number-size\)/);
  assert.match(button, /height:\s*var\(--calculator-number-size\)/);
});

test('12-column controls grow responsively while four result cards keep the available width', () => {
  const row = block(feature, '.column-grid > div');
  assert.match(row, /height:\s*var\(--calculator-column-row-height\)/);
  assert.match(row, /min-height:\s*var\(--calculator-column-row-height\)/);
  assert.match(row, /padding:\s*4px var\(--calculator-column-inline-padding\)/);
  assert.match(row, /grid-template-columns:\s*minmax\(0, 1fr\) var\(--calculator-column-control-size\)/);
  assert.match(row, /column-gap:\s*var\(--calculator-column-gap\)/);
  assert.match(block(feature, '.calculation-results > div'), /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(block(feature, '.calculation-results > div'), /gap:\s*8px/);
  const cards = block(feature, '.calculation-results article');
  assert.match(cards, /width:\s*100%/);
  assert.match(cards, /min-width:\s*0/);
  assert.match(cards, /height:\s*60px/);
});

test('calculator result-card height is not cancelled by a later global rule', () => {
  assert.doesNotMatch(feature, /\.calculation-results article\s*\{[^}]*height:\s*auto/s);
  assert.doesNotMatch(feature, /\.calculation-results article\s*,\s*\.filter-sheet\s*\{[^}]*height:\s*auto/s);
});

test('temporary global debug outlines are absent', () => {
  assert.doesNotMatch(prototype, /Temporary global container debug outlines/);
  assert.doesNotMatch(prototype, /--debug-container-/);
  assert.doesNotMatch(prototype, /#root\s+:where\([^)]*\)\s*\{\s*outline:/s);
});

test('calculator responsive geometry remains inside 430px, 390px, 375px and 360px viewports', () => {
  const clamp = (min, preferred, max) => Math.max(min, Math.min(preferred, max));

  for (const viewport of [430, 390, 375, 360]) {
    const bodyWidth = viewport - 32;
    const panelInlinePadding = clamp(4, viewport * 0.013, 6);
    const panelInnerWidth = bodyWidth - 2 - (2 * panelInlinePadding);
    const resultInnerWidth = bodyWidth - 10;
    const gridGap = clamp(4, viewport * 0.012, 6);
    const numberSize = clamp(36, (viewport - 74) / 7, 48);
    const numberGridWidth = (7 * numberSize) + (6 * gridGap);
    const resultCardWidth = (resultInnerWidth - (3 * 8)) / 4;
    const columnCellWidth = panelInnerWidth / 2;
    const controlWidth = clamp(30, viewport * 0.093, 40);
    const valueWidth = clamp(18, viewport * 0.048, 22);
    const columnGap = clamp(2, viewport * 0.006, 3);
    const columnPadding = clamp(4, viewport * 0.015, 7);
    const columnLabelWidth = columnCellWidth - (2 * columnPadding) - (2 * controlWidth) - valueWidth - (3 * columnGap);

    assert.ok(numberGridWidth <= panelInnerWidth, `${viewport}px calculator grid must keep seven responsive controls on one row`);
    assert.ok(numberSize > 38, `${viewport}px number controls must be larger than the previous 38px size`);
    assert.ok(controlWidth > 28, `${viewport}px column controls must be larger than the previous 28px size`);
    assert.ok(resultCardWidth >= 71, `${viewport}px result cards must remain readable`);
    assert.ok(columnLabelWidth >= 47, `${viewport}px column labels must remain visible`);
  }
});
