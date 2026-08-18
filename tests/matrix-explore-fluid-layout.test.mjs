import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync('src/feature-pages.css', 'utf8');
const startMarker = '/* Matrix Explore main canonical mobile sizing */';
const endMarker = '/* v55 scoped density and hierarchy refinements */';
const start = css.indexOf(startMarker);
const end = css.indexOf(endMarker);
assert.notEqual(start, -1);
assert.notEqual(end, -1);
const block = css.slice(start, end);

test('main container is fluid', () => {
  assert.match(block, /\.matrix-explore-main-screen \.feature-body\s*\{[\s\S]*?width:\s*100%;[\s\S]*?padding:\s*1rem;[\s\S]*?gap:\s*\.875rem;/);
  assert.doesNotMatch(block, /\bwidth:\s*\d+px\b/);
});

test('rows stack then switch at md', () => {
  assert.match(block, /\.matrix-explore-main-screen \.explore-settings \.setting-grid label,[\s\S]*?flex-direction:\s*column;[\s\S]*?gap:\s*\.5rem;/);
  assert.match(block, /@media \(min-width:\s*48rem\)[\s\S]*?flex-direction:\s*row;[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*space-between;/);
  assert.match(block, /flex:\s*0 0 auto;/);
});

test('controls use minimum heights and fluid grids', () => {
  assert.match(block, /min-height:\s*34px;/);
  assert.match(block, /\.matrix-explore-main-screen \.primary-action\s*\{[\s\S]*?min-height:\s*38px;/);
  assert.match(block, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(block, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
});

test('badges stay locked to parent buttons', () => {
  assert.match(block, /\.matrix-explore-main-screen \.segmented button,[\s\S]*?position:\s*relative;/);
  assert.match(block, /\.matrix-explore-main-screen \.segmented button em\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*-7px;[\s\S]*?right:\s*\.375rem;[\s\S]*?padding-inline:\s*\.375rem;[\s\S]*?transform:\s*scale\(\.9\);[\s\S]*?white-space:\s*nowrap;/);
});
