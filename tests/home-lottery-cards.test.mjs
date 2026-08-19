import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const prototype = fs.readFileSync('src/Prototype.tsx', 'utf8');
const css = fs.readFileSync('src/homepage-repair.css', 'utf8');

const CARD_ASSETS = [
  '/assets/lottery/status/Matrixbba-1.png',
  '/assets/lottery/status/Matrixbba-2.png',
  '/assets/lottery/status/Matrixbba-3.png',
  '/assets/lottery/status/Matrixbba-4.png',
];

test('homepage lottery switcher renders four independent card images', () => {
  for (const asset of CARD_ASSETS) assert.match(prototype, new RegExp(asset.replaceAll('/', '\\/').replace('.', '\\.')));
  assert.doesNotMatch(prototype, /lotterySwitcher:\s*`?\$\{STATUS_ASSET_BASE\}\/Matrixbba\.png/);
  assert.match(prototype, /className="lottery-card-image"\s+src=\{lottery\.logo\}/);
});

test('homepage lottery cards use one responsive four-column grid with 3px gaps', () => {
  assert.match(css, /\.home-screen \.lottery-switcher-hit-grid\s*\{[\s\S]*?position:\s*relative;[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[\s\S]*?gap:\s*3px;/);
  assert.match(css, /\.home-screen \.lottery-card-image\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*auto;/);
});
