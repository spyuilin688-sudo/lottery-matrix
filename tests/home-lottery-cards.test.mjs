import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const prototype = fs.readFileSync('src/Prototype.tsx', 'utf8');
const css = fs.readFileSync('src/homepage-repair.css', 'utf8');

test('homepage lottery switcher renders four independent visible card surfaces', () => {
  assert.doesNotMatch(prototype, /<img className="home-asset-image" src=\{HOME_ASSETS\.lotterySwitcher\}/);
  assert.match(prototype, /<span className="lottery-card-image" aria-hidden="true" \/>/);
});

test('homepage lottery cards use the formal Matrixbba artwork as four responsive slices', () => {
  assert.match(css, /\.home-screen \.lottery-switcher-hit-grid\s*\{[\s\S]*?position:\s*relative;[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[\s\S]*?gap:\s*3px;/);
  assert.match(css, /\.home-screen \.lottery-card-image\s*\{[\s\S]*?background-image:\s*url\("\/assets\/lottery\/status\/Matrixbba\.png"\);/);
  assert.match(css, /data-lottery="今彩539"[\s\S]*?background-position:\s*0% 50%/);
  assert.match(css, /data-lottery="天天樂"[\s\S]*?background-position:\s*33\.333% 50%/);
  assert.match(css, /data-lottery="六合彩"[\s\S]*?background-position:\s*66\.667% 50%/);
  assert.match(css, /data-lottery="大樂透"[\s\S]*?background-position:\s*100% 50%/);
});
