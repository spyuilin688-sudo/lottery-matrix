import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tongxing = fs.readFileSync('src/tongxing-compact.css', 'utf8');
const feature = fs.readFileSync('src/feature-pages.css', 'utf8');

function block(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? '';
}

test('Matrix 同星 controls use the compact shared mobile dimensions', () => {
  assert.match(tongxing, /--control-gap:\s*6px;/);
  assert.match(tongxing, /--control-height:\s*36px;/);
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
});

test('號碼對照單 uses one responsive three-select grid without the old fixed override', () => {
  assert.match(feature, /\.number-reference-screen \.query-selects\.three-cols\s*\{[^}]*grid-template-columns:\s*minmax\(0, \.85fr\) minmax\(0, \.8fr\) minmax\(0, 1\.75fr\)/s);
  assert.doesNotMatch(feature, /\.number-reference-screen \.query-selects\.three-cols\s*\{\s*grid-template-columns:\s*100px 92px minmax\(0, 1fr\);\s*\}/);
  assert.match(feature, /\.reference-search > div\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\) minmax\(0, 1\.7fr\);[^}]*gap:\s*6px/s);
});

test('bounded responsive rules do not add prohibited compensation techniques', () => {
  for (const css of [tongxing, feature]) {
    const relevant = css
      .split('\n')
      .filter((line) => /tongxing|number-reference|reference-search/.test(line) || /!important|zoom\s*:|scale\(|margin[^:]*:\s*-/.test(line))
      .join('\n');
    assert.doesNotMatch(relevant, /!important|zoom\s*:|scale\(|margin(?:-[a-z]+)?\s*:\s*-/);
  }
});
