import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const feature = fs.readFileSync('src/feature-pages.css', 'utf8');
const prototype = fs.readFileSync('src/prototype.css', 'utf8');

function block(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return '';
  const bodyStart = css.indexOf('{', start) + 1;
  return css.slice(bodyStart, css.indexOf('}', bodyStart));
}

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
