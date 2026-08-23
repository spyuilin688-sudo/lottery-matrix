import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const responsive = readFileSync('src/responsive-feature-pages.css', 'utf8');

test('history, Matrix TongXing and number-reference debug outlines are removed', () => {
  assert.doesNotMatch(responsive, /TEMP: container boundary diagnostics/);
  assert.doesNotMatch(responsive, /(?:draw-history-screen|tongxing-screen|number-reference-screen)[^\{]*\{[^}]*outline:/s);
  assert.doesNotMatch(responsive, /(?:history-filter-panel|tongxing-query|reference-query-panel)\[data-floating="true"\]\s*\{[^}]*outline:/s);
});
