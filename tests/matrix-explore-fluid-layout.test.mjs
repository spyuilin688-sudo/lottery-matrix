import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync('src/matrix-explore-spacing.css', 'utf8');

test('main container is fluid', () => {
  assert.match(css, /\.matrix-explore-main-screen \.feature-body\s*\{[\s\S]*?width:\s*100%;[\s\S]*?padding:\s*1rem;[\s\S]*?gap:\s*\.875rem;/);
  assert.doesNotMatch(css, /grid-template-columns:\s*\d+px\s+minmax/);
});

test('rows stack then switch at md', () => {
  assert.match(css, /\.matrix-explore-main-screen \.explore-settings \.setting-grid label,[\s\S]*?flex-direction:\s*column;[\s\S]*?gap:\s*\.5rem;/);
  assert.match(css, /@media \(min-width:\s*48rem\)[\s\S]*?flex-direction:\s*row;[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*space-between;/);
  assert.match(css, /flex:\s*0 0 auto;/);
});

test('controls use minimum heights and fluid grids', () => {
  assert.match(css, /min-height:\s*34px;/);
  assert.match(css, /\.matrix-explore-main-screen \.primary-action\s*\{[\s\S]*?min-height:\s*38px;/);
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
});

test('badges stay locked to parent buttons', () => {
  assert.match(css, /\.matrix-explore-main-screen \.segmented button,[\s\S]*?position:\s*relative;/);
  assert.match(css, /\.matrix-explore-main-screen \.segmented button em\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*-7px;[\s\S]*?right:\s*\.375rem;[\s\S]*?padding-inline:\s*\.375rem;[\s\S]*?transform:\s*scale\(\.9\);[\s\S]*?white-space:\s*nowrap;/);
});

test('legacy high-specificity fixed sizing is neutralized in active source', () => {
  assert.match(css, /\.matrix-explore-main-screen \.explore-settings \.segmented\.three button,[\s\S]*?height:\s*auto;[\s\S]*?min-height:\s*34px;/);
  assert.match(css, /\.matrix-explore-main-screen \.history-row,[\s\S]*?\.matrix-explore-main-screen \.history-row\.history-head,[\s\S]*?\.matrix-explore-main-screen \.history-row:not\(\.history-head\)[\s\S]*?height:\s*auto;/);
  assert.match(css, /\.matrix-explore-main-screen \.history-row\.history-head\s*\{[\s\S]*?min-height:\s*2\.25rem;/);
  assert.match(css, /\.matrix-explore-main-screen \.history-row:not\(\.history-head\)\s*\{[\s\S]*?min-height:\s*2\.875rem;/);
});
