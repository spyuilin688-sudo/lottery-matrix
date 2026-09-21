import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const tianhengCss = readFileSync('src/matrix-tianheng.css', 'utf8');
const exploreCss = readFileSync('src/matrix-explore-spacing.css', 'utf8');
const resultCss = readFileSync('src/explore-result-preview.css', 'utf8');
const tiangongCss = readFileSync('src/matrix-tiangong-results.css', 'utf8');
const sharedSource = readFileSync('src/features/shared.tsx', 'utf8');

test('Tianheng summary streak tag matches the Tianyan top-right inset', () => {
  assert.match(tianhengCss, /\.matrix-tianheng-screen \.explore-validation-summary-card\s*\{[^}]*position:\s*relative;/s);
  assert.match(tianhengCss, /\.matrix-tianheng-screen \.explore-validation-summary-card > \.explore-validation-consecutive-tag\s*\{[^}]*position:\s*absolute;[^}]*top:\s*2px;[^}]*right:\s*2px;[^}]*margin:\s*0;/s);
});

test('Tianheng summary uses the current two-row grid without the retired spanning label', () => {
  assert.doesNotMatch(tianhengCss, /tianheng-summary-open-label|grid-row:\s*1\s*\/\s*3;/);
  assert.match(
    tianhengCss,
    /\.matrix-tianheng-screen \.tianheng-summary-lines \.tianyan-validation-summary-row:nth-child\(2\)\s*\{[^}]*grid-row:\s*2;[^}]*grid-column:\s*3;[^}]*justify-content:\s*flex-start;/s,
  );
});

test('Tianheng cards keep the shared Explore horizontal spacing owner', () => {
  assert.doesNotMatch(
    tianhengCss,
    /\.(?:explore-settings|hit-advanced-panel|repeat-stats-panel|result-panel)\s*\{[^}]*(?:margin-inline|padding-inline|width)\s*:/s,
  );
});

test('Tianheng position labels use a 1.5px vertical gap', () => {
  assert.match(
    tianhengCss,
    /\.matrix-tianheng-screen \.tianheng-lock-positions\s*\{[^}]*row-gap:\s*1\.5px;/s,
  );
});

test('Matrix switcher is text-only and has no retired artwork rule', () => {
  const start = sharedSource.indexOf('export function MatrixPageSwitcher');
  const end = sharedSource.indexOf('export const ROAD_VALIDATION_SAMPLE_HISTORY', start);
  assert.ok(start >= 0 && end > start, 'expected MatrixPageSwitcher source');
  const switcherSource = sharedSource.slice(start, end);
  assert.doesNotMatch(switcherSource, /<img|clip-path/);
  assert.doesNotMatch(exploreCss, /matrix-page-switcher img/);
});

test('Matrix validation groups keep black gutters and shared row dividers', () => {
  assert.match(
    resultCss,
    /\.matrix-explore-main-screen \.explore-validation-groups,\s*\.matrix-explore-main-screen \.explore-validation-group\s*\{[^}]*background:\s*#000;/s,
  );
  assert.doesNotMatch(
    resultCss,
    /\.matrix-explore-main-screen:not\(\.matrix-tiangong-screen\) \.explore-validation-(?:groups|group)[^{]*\{[^}]*background:\s*#02070C;/s,
  );
  assert.match(
    resultCss,
    /\.explore-validation-number-row:nth-child\(n \+ 2\),\s*\.explore-validation-issue:nth-child\(n \+ 2\),\s*\.explore-validation-formula-row:nth-child\(n \+ 2\)\s*\{[^}]*border-top:\s*1px solid var\(--pwa-frame-divider\);/s,
  );
  assert.doesNotMatch(
    tiangongCss,
    /\.matrix-tiangong-screen \.explore-validation-(?:groups|group)[^{]*\{[^}]*background:\s*#02070C;/s,
  );
});
