import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tongxing = fs.readFileSync('src/tongxing-compact.css', 'utf8');
const feature = fs.readFileSync('src/feature-pages.css', 'utf8');

function block(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? '';
}

test('floating TongXing settings never expose the hidden lottery tabs after portal rendering', () => {
  assert.match(tongxing, /\.tongxing-query \.lottery-tabs\s*\{\s*display:\s*none;\s*\}/);
  assert.doesNotMatch(tongxing, /\.tongxing-screen \.tongxing-query \.lottery-tabs\s*\{\s*display:\s*none;\s*\}/);
});

test('lottery and number-order selects keep the original cut-corner frame without bright straight borders', () => {
  const queryBox = block(tongxing, '.tongxing-panel-scope .query-selects .select-box');
  assert.doesNotMatch(queryBox, /border:\s*1px solid #b98723/);
  assert.doesNotMatch(queryBox, /border-radius:\s*0/);
  assert.doesNotMatch(tongxing, /\.tongxing-panel-scope \.select-box::before,[\s\S]*?\.tongxing-panel-scope \.select-box::after\s*\{\s*display:\s*none;/s);
  assert.match(feature, /\.select-box::before,[\s\S]*?clip-path:\s*polygon\(/s);
});

test('period select reserves enough space so the dropdown arrow cannot cover its text', () => {
  const periodSelect = block(tongxing, '.tongxing-screen .same-star-period-select select');
  const arrow = block(tongxing, '.tongxing-screen .same-star-period-select svg');
  assert.match(periodSelect, /padding-inline:\s*7px 28px/);
  assert.match(arrow, /right:\s*6px/);
  assert.match(arrow, /width:\s*16px/);
});

test('TongXing result list uses compact readable rows so more results fit on screen', () => {
  assert.match(tongxing, /--table-header-height:\s*28px;/);
  assert.match(tongxing, /--table-row-height:\s*36px;/);
  assert.match(tongxing, /--result-row-height:\s*36px;/);
  assert.match(block(tongxing, '.tongxing-screen .tongxing-table-row > span'), /font-size:\s*clamp\(12px, 3\.4vw, 14px\)/);
  assert.match(block(tongxing, '.tongxing-screen .tongxing-table-head > span'), /font-size:\s*clamp\(10px, 3vw, 12px\)/);
  assert.match(block(tongxing, '.tongxing-screen .tongxing-period-cell strong'), /font-size:\s*12px/);
  assert.match(block(tongxing, '.tongxing-screen .tongxing-period-cell time'), /font-size:\s*9px/);
});
