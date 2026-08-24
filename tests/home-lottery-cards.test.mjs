import test from 'node:test';
import assert from 'node:assert/strict';
import { readLocalCss } from './helpers/read-local-css.mjs';

const css = readLocalCss('src/homepage-repair.css');

test('homepage hides the composite switcher image and uses four independent card surfaces', () => {
  assert.match(css, /\.lottery-switcher--home-style > \.home-asset-image\s*\{[\s\S]*?display:\s*none;/);
  assert.match(css, /\.lottery-switcher--home-style \.lottery-switcher-hit-grid\s*\{[^}]*position:\s*relative;[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/s);
  assert.match(css, /\.lottery-switcher--home-style \.lottery-switcher-hit-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[^}]*gap:\s*6px;/s);
});

test('each lottery button displays its own quarter of the formal Matrixbba artwork', () => {
  assert.match(css, /\.lottery-switcher--home-style[^}]*\.lottery-card\s*\{[^}]*background-image:\s*url\("\/assets\/lottery\/status\/Matrixbba\.png"\);/s);
  assert.match(css, /\.lottery-switcher--home-style[^}]*\.lottery-card\s*\{[^}]*background-size:\s*calc\(400% \+ 24px\) 100%;/s);
  assert.match(css, /data-lottery="今彩539"[^}]*\{[^}]*background-position:\s*0% 50%/);
  assert.match(css, /data-lottery="天天樂"[^}]*\{[^}]*background-position:\s*33\.333% 50%/);
  assert.match(css, /data-lottery="六合彩"[^}]*\{[^}]*background-position:\s*66\.667% 50%/);
  assert.match(css, /data-lottery="大樂透"[^}]*\{[^}]*background-position:\s*100% 50%/);
});
