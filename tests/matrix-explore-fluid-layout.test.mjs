import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync('src/matrix-explore-spacing.css', 'utf8');

test('page container uses responsive 12px gutters and parent spacing', () => {
  assert.match(css, /\.matrix-explore-main-screen \.feature-body\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*32rem;[\s\S]*?margin:\s*0 auto;[\s\S]*?padding:\s*1rem \.75rem;[\s\S]*?gap:\s*\.875rem;/);
  assert.doesNotMatch(css, /\.matrix-explore-main-screen \.feature-body[\s\S]*?width:\s*\d+px/);
});

test('cards use responsive padding with no compensating margins', () => {
  assert.match(css, /\.matrix-explore-main-screen \.explore-settings,[\s\S]*?padding:\s*\.875rem;[\s\S]*?border-radius:\s*\.75rem;/);
  assert.doesNotMatch(css, /\.matrix-explore-main-screen (?:\.explore-settings|\.hit-advanced-panel|\.history-panel|\.repeat-stats-panel|\.result-panel)[^\{]*\{[\s\S]*?margin-(?:top|bottom):/);
});

test('form rows stay inline and controls flex into remaining width', () => {
  assert.match(css, /\.matrix-explore-main-screen \.explore-settings \.setting-grid label,[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*row;[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*space-between;[\s\S]*?gap:\s*\.75rem;/);
  assert.match(css, /\.matrix-explore-main-screen \.explore-settings \.setting-grid label > span,[\s\S]*?display:\s*flex;[\s\S]*?gap:\s*\.5rem;[\s\S]*?flex:\s*0 0 auto;[\s\S]*?white-space:\s*nowrap;/);
  assert.match(css, /\.matrix-explore-main-screen \.explore-settings \.setting-grid label > \.select-box,[\s\S]*?flex:\s*1 1 0;/);
});

test('form icons and option buttons follow reference sizing', () => {
  assert.match(css, /\.matrix-explore-main-screen \.explore-settings \.setting-grid label > span \.setting-label-icon,[\s\S]*?inline-size:\s*2rem;[\s\S]*?block-size:\s*2rem;[\s\S]*?border-radius:\s*\.5rem;/);
  assert.match(css, /\.matrix-explore-main-screen \.segmented button,[\s\S]*?height:\s*auto;[\s\S]*?min-height:\s*38px;[\s\S]*?padding:\s*\.375rem \.75rem;[\s\S]*?font-size:\s*\.75rem;[\s\S]*?font-weight:\s*700;/);
});

test('badges are absolutely locked without affecting button sizing', () => {
  assert.match(css, /\.matrix-explore-main-screen \.segmented button,[\s\S]*?position:\s*relative;/);
  assert.match(css, /\.matrix-explore-main-screen \.segmented button em\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?z-index:\s*10;[\s\S]*?top:\s*-\.625rem;[\s\S]*?right:\s*-\.25rem;[\s\S]*?padding:\s*\.125rem \.375rem;[\s\S]*?font-size:\s*\.625rem;[\s\S]*?transform:\s*scale\(\.9\);[\s\S]*?white-space:\s*nowrap;/);
});

test('history table uses 12-column 3-3-6 layout and compact responsive balls', () => {
  assert.match(css, /\.matrix-explore-main-screen \.history-row,[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(12,\s*minmax\(0,\s*1fr\)\);[\s\S]*?gap:\s*\.25rem;[\s\S]*?padding:\s*\.625rem 0;/);
  assert.match(css, /\.matrix-explore-main-screen \.history-row > :nth-child\(1\)[\s\S]*?grid-column:\s*span 3;/);
  assert.match(css, /\.matrix-explore-main-screen \.history-row > :nth-child\(2\)[\s\S]*?grid-column:\s*span 3;/);
  assert.match(css, /\.matrix-explore-main-screen \.history-row > :nth-child\(3\)[\s\S]*?grid-column:\s*span 6;/);
  assert.match(css, /\.matrix-explore-main-screen \.history-main-numbers[\s\S]*?display:\s*flex;[\s\S]*?gap:\s*\.25rem;/);
});
