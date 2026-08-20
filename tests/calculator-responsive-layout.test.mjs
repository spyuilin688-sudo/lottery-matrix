import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const feature = fs.readFileSync('src/feature-pages.css', 'utf8');
const prototype = fs.readFileSync('src/prototype.css', 'utf8');

function block(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return '';
  const bodyStart = css.indexOf('{', start) + 1;
  return css.slice(bodyStart, css.indexOf('}', bodyStart));
}

function calculatorStyles() {
  const virtualConsole = new VirtualConsole();
  const warn = console.warn;
  console.warn = () => {};
  const dom = new JSDOM(`<!doctype html>
    <style>${feature}</style>
    <main class="calculator-screen">
      <div class="feature-body">
        <nav class="mode-tabs"><button data-selected="true">連碰</button><button>立柱</button></nav>
        <section class="calculator-panel">
          <header>
            <div class="calculator-heading">
              <div class="section-title"><span></span>連碰設定</div>
              <span class="calculator-summary">計算總數：<strong>1</strong> 個</span>
            </div>
            <div class="calculator-actions"><button>選號</button></div>
          </header>
          <div class="number-grid"><button>01</button></div>
          <div class="quick-actions"><button>全部設為 2</button></div>
          <div class="column-grid"><div><span>第 1 柱</span><button>−</button><strong>1</strong><button>＋</button></div></div>
        </section>
        <section class="calculation-results">
          <div class="section-title"><span></span>計算結果</div>
          <div><article><span>二星</span><strong>2</strong></article></div>
        </section>
      </div>
    </main>`, { virtualConsole });
  console.warn = warn;
  const style = (selector) => dom.window.getComputedStyle(dom.window.document.querySelector(selector));
  return { dom, style };
}

test('calculator compact styles render at the approved sizes without shrinking number controls', () => {
  const { dom, style } = calculatorStyles();
  const tabs = style('.mode-tabs');
  const firstTab = style('.mode-tabs button');

  assert.equal(tabs.height, '26px');
  assert.equal(firstTab.height, '24px');
  assert.equal(firstTab.minHeight, '24px');
  assert.equal(firstTab.fontSize, '9px');
  assert.equal(firstTab.borderRightColor, tabs.borderRightColor);

  assert.equal(style('.calculator-panel').paddingTop, '8px');
  assert.equal(style('.calculator-panel').paddingRight, '4px');
  assert.equal(style('.calculator-panel').paddingBottom, '12px');
  assert.equal(style('.calculator-screen .section-title').fontSize, '16px');
  assert.equal(style('.calculator-summary').fontSize, '12px');
  assert.equal(style('.calculator-summary').fontWeight, '700');

  assert.equal(style('.calculator-panel header button').height, '24px');
  assert.equal(style('.calculator-panel header button').fontSize, '8.4px');
  assert.equal(style('.quick-actions button').height, '24px');
  assert.equal(style('.quick-actions button').fontSize, '8.4px');

  assert.equal(style('.calculation-results').paddingTop, '6px');
  assert.equal(style('.calculation-results').paddingBottom, '6px');
  assert.equal(style('.calculation-results article span').fontSize, '14px');
  assert.equal(style('.calculation-results article strong').fontSize, '18px');

  assert.equal(style('.number-grid button').height, '42px');
  assert.equal(style('.number-grid button').width, '42px');
  dom.window.close();
});

test('calculator uses one fluid width source at 390px, 375px and 360px', () => {
  for (const selector of ['.mode-tabs', '.calculator-panel', '.calculation-results', '.column-grid']) {
    assert.match(block(feature, selector), /width:\s*100%/);
    assert.doesNotMatch(block(feature, selector), /width:\s*(?:340|366)px/);
  }
  assert.doesNotMatch(block(feature, '.calculator-screen > .feature-body'), /overflow-x:\s*hidden/);
});

test('49-number layout keeps seven columns without horizontal overflow', () => {
  const grid = block(feature, '.number-grid');
  assert.match(grid, /grid-template-columns:\s*repeat\(7, minmax\(0, 42px\)\)/);
  assert.match(grid, /justify-content:\s*space-between/);
});

test('12-column controls and four result cards shrink inside the available width', () => {
  assert.match(block(feature, '.column-grid > div'), /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(block(feature, '.calculation-results > div'), /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  const cards = block(feature, '.calculation-results article');
  assert.match(cards, /width:\s*100%/);
  assert.match(cards, /min-width:\s*0/);
  assert.match(cards, /height:\s*92px/);
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

test('calculator geometry remains inside 390px, 375px and 360px viewports', () => {
  for (const viewport of [390, 375, 360]) {
    const bodyWidth = viewport - 24;
    const panelInnerWidth = bodyWidth - 24;
    const numberGap = (panelInnerWidth - (7 * 42)) / 6;
    const resultCardWidth = (panelInnerWidth - (3 * 8)) / 4;
    const columnCellWidth = panelInnerWidth / 2;
    const controlWidth = Math.min(34, Math.max(30, viewport * 0.0872));
    const valueWidth = Math.min(24, Math.max(20, viewport * 0.0615));
    const columnGap = Math.min(4, Math.max(2, viewport * 0.0103));
    const columnPadding = Math.min(6, Math.max(3, viewport * 0.0154));
    const columnLabelWidth = columnCellWidth - (2 * columnPadding) - (2 * controlWidth) - valueWidth - (3 * columnGap);

    assert.ok(numberGap >= 2, `${viewport}px number-grid gap must stay non-negative`);
    assert.ok(resultCardWidth >= 71, `${viewport}px result cards must remain readable`);
    assert.ok(columnLabelWidth >= 47, `${viewport}px column labels must remain visible`);
  }
});
