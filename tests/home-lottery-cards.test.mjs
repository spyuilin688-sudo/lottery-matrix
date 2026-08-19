import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('src/homepage-repair.css', 'utf8');

test('homepage hides the composite switcher image and uses four independent card surfaces', () => {
  assert.match(css, /\.home-screen \.lottery-switcher > \.home-asset-image\s*\{[\s\S]*?display:\s*none;/);
  assert.match(css, /\.home-screen \.lottery-switcher-hit-grid\s*\{[\s\S]*?position:\s*relative;[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[\s\S]*?gap:\s*3px;/);
});

test('each lottery button displays its own quarter of the formal Matrixbba artwork', () => {
  assert.match(css, /\.home-screen \.lottery-switcher[^}]*\.lottery-card\s*\{[\s\S]*?background-image:\s*url\("\/assets\/lottery\/status\/Matrixbba\.png"\);[\s\S]*?background-size:\s*400% 100%;/);
  assert.match(css, /data-lottery="今彩539"[^}]*\{[^}]*background-position:\s*0% 50%/);
  assert.match(css, /data-lottery="天天樂"[^}]*\{[^}]*background-position:\s*33\.333% 50%/);
  assert.match(css, /data-lottery="六合彩"[^}]*\{[^}]*background-position:\s*66\.667% 50%/);
  assert.match(css, /data-lottery="大樂透"[^}]*\{[^}]*background-position:\s*100% 50%/);
});
