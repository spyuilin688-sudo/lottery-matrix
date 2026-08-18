import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync('src/matrix-explore-spacing.css', 'utf8');
const ballCss = readFileSync('src/number-ball.css', 'utf8');

function ruleBlock(source, selectorPattern) {
  const match = source.match(new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `Missing rule block for ${selectorPattern}`);
  return match[1];
}

test('page container uses responsive 12px gutters and parent spacing', () => {
  const block = ruleBlock(css, '\\.matrix-explore-main-screen \\.feature-body');
  assert.match(block, /width:\s*100%/);
  assert.match(block, /max-width:\s*28rem/);
  assert.match(block, /margin:\s*0 auto/);
  assert.match(block, /padding:\s*1rem \.75rem/);
  assert.match(block, /gap:\s*\.875rem/);
  assert.doesNotMatch(block, /width:\s*\d+px/);
  assert.match(css, /@media \(min-width:\s*48rem\)[\s\S]*?\.matrix-explore-main-screen \.feature-body\s*\{[^}]*max-width:\s*32rem;/);
});

test('cards use responsive padding with no compensating margins', () => {
  const block = ruleBlock(css, '\\.matrix-explore-main-screen \\.explore-settings,[\\s\\S]*?\\.matrix-explore-main-screen \\.result-panel');
  assert.match(block, /padding:\s*\.875rem/);
  assert.match(block, /border-radius:\s*\.75rem/);
  assert.doesNotMatch(block, /margin-(?:top|bottom):/);
  assert.match(css, /@media \(min-width:\s*40rem\)[\s\S]*?\.matrix-explore-main-screen \.explore-settings,[\s\S]*?\.matrix-explore-main-screen \.result-panel\s*\{[^}]*padding:\s*1rem;/);
});

test('form rows stay inline and controls flex into remaining width', () => {
  const row = ruleBlock(css, '\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid label,[\\s\\S]*?\\.matrix-explore-main-screen \\.advanced-panel label');
  assert.match(row, /display:\s*flex/);
  assert.match(row, /flex-direction:\s*row/);
  assert.match(row, /align-items:\s*center/);
  assert.match(row, /justify-content:\s*space-between/);
  assert.match(row, /gap:\s*\.75rem/);

  const left = ruleBlock(css, '\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid label > span,[\\s\\S]*?\\.matrix-explore-main-screen \\.advanced-panel label > \\.advanced-setting-title');
  assert.match(left, /display:\s*flex/);
  assert.match(left, /gap:\s*\.5rem/);
  assert.match(left, /flex:\s*0 0 auto/);
  assert.match(left, /white-space:\s*nowrap/);

  const right = ruleBlock(css, '\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid label > \\.select-box,[\\s\\S]*?\\.matrix-explore-main-screen \\.advanced-panel label > \\.segmented');
  assert.match(right, /flex:\s*1 1 0/);
});

test('form icons and option buttons follow reference sizing', () => {
  const icon = ruleBlock(css, '\\.matrix-explore-main-screen \\.explore-settings \\.setting-grid label > span \\.setting-label-icon,[\\s\\S]*?\\.matrix-explore-main-screen \\.matrix-explore-setting-icon');
  assert.match(icon, /inline-size:\s*2rem/);
  assert.match(icon, /block-size:\s*2rem/);
  assert.match(icon, /border-radius:\s*\.5rem/);

  const button = ruleBlock(css, '\\.matrix-explore-main-screen \\.segmented button,[\\s\\S]*?\\.matrix-explore-main-screen \\.hit-options button');
  assert.match(button, /height:\s*auto/);
  assert.match(button, /min-height:\s*38px/);
  assert.match(button, /padding:\s*\.375rem \.75rem/);
  assert.match(button, /font-size:\s*\.75rem/);
  assert.match(button, /font-weight:\s*700/);
  assert.match(button, /position:\s*relative/);
});

test('badges are absolutely locked without affecting button sizing', () => {
  const badge = ruleBlock(css, '\\.matrix-explore-main-screen \\.segmented button em');
  assert.match(badge, /position:\s*absolute/);
  assert.match(badge, /z-index:\s*10/);
  assert.match(badge, /top:\s*-\.625rem/);
  assert.match(badge, /right:\s*-\.25rem/);
  assert.match(badge, /padding:\s*\.125rem \.375rem/);
  assert.match(badge, /font-size:\s*\.625rem/);
  assert.match(badge, /transform:\s*scale\(\.9\)/);
  assert.match(badge, /white-space:\s*nowrap/);
});

test('history table uses 12-column 3-3-6 layout and compact responsive balls', () => {
  const row = ruleBlock(css, '\\.matrix-explore-main-screen \\.history-row,[\\s\\S]*?\\.matrix-explore-main-screen \\.history-row:not\\(\\.history-head\\)');
  assert.match(row, /display:\s*grid/);
  assert.match(row, /grid-template-columns:\s*repeat\(12,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(row, /gap:\s*\.25rem/);
  assert.match(row, /padding:\s*\.625rem 0/);
  assert.match(css, /\.matrix-explore-main-screen \.history-row > :nth-child\(1\)\s*\{[^}]*grid-column:\s*span 3;/);
  assert.match(css, /\.matrix-explore-main-screen \.history-row > :nth-child\(2\)\s*\{[^}]*grid-column:\s*span 3;/);
  assert.match(css, /\.matrix-explore-main-screen \.history-row > :nth-child\(3\)\s*\{[^}]*grid-column:\s*span 6;/);

  const numbers = ruleBlock(css, '\\.matrix-explore-main-screen \\.history-main-numbers');
  assert.match(numbers, /display:\s*flex/);
  assert.match(numbers, /gap:\s*\.25rem/);
  assert.match(ballCss, /\.matrix-explore-main-screen \.history-panel \.number-ball-component\.history-lottery-ball\s*\{[^}]*--number-ball-size:\s*1\.5rem;/);
  assert.match(ballCss, /@media \(min-width:\s*40rem\)[\s\S]*?\.matrix-explore-main-screen \.history-panel \.number-ball-component\.history-lottery-ball\s*\{[^}]*--number-ball-size:\s*1\.75rem;/);
});
