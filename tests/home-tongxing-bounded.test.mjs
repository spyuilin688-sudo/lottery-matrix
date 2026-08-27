import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readLocalCss } from './helpers/read-local-css.mjs';

const prototype = fs.readFileSync('src/Prototype.tsx', 'utf8');
const tokens = fs.readFileSync('src/design-tokens.css', 'utf8');
const homeCss = readLocalCss('src/homepage-repair.css');
const tongCss = fs.readFileSync('src/tongxing-compact.css', 'utf8');
const exploreCss = fs.readFileSync('src/matrix-explore-spacing.css', 'utf8');

test('homepage removes draw-toolbar wrapper and halves next draw row height', () => {
  assert.doesNotMatch(prototype, /className="draw-toolbar"/);
  assert.match(homeCss, /grid-template-rows:\s*44px minmax\(0, 1fr\) 24px;/);
  assert.match(homeCss, /\.next-draw-info--embedded\s*\{[\s\S]*?height:\s*24px;[\s\S]*?min-height:\s*24px;[\s\S]*?max-height:\s*24px;/);
  assert.match(homeCss, /\.next-draw-item\s*\{[\s\S]*?gap:\s*0\.5px;/);
});

test('Matrix 同星沿用功能頁共用外距、26px 控制項與現行響應式字級', () => {
  assert.match(tokens, /--layout-page-inline:\s*16px;/);
  assert.doesNotMatch(tongCss, /\.tongxing-screen \.feature-body\s*\{[\s\S]*?padding-left:\s*8px;/);
  assert.doesNotMatch(tongCss, /\.tongxing-screen \.feature-body\s*\{[\s\S]*?padding-right:\s*16px;/);
  assert.match(tongCss, /--control-height:\s*26px;/);
  const exploreFont = exploreCss.match(/\.matrix-explore-main-screen \.native-select select\s*\{[\s\S]*?font-size:\s*([^;]+);/)?.[1]?.trim();
  assert.equal(exploreFont, '.75rem');
  assert.match(tongCss, /\.tongxing-query \.query-selects select,\s*\.tongxing-query \.same-star-period-select select\s*\{[^}]*font-size:\s*clamp\(9px, 3vw, 12px\);/s);
});
