import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const tianhengCss = readFileSync('src/matrix-tianheng.css', 'utf8');
const exploreCss = readFileSync('src/matrix-explore-spacing.css', 'utf8');
const resultCss = readFileSync('src/explore-result-preview.css', 'utf8');
const tiangongCss = readFileSync('src/matrix-tiangong-results.css', 'utf8');

test('Tianheng summary streak tag matches the Tianyan top-right inset', () => {
  assert.match(tianhengCss, /\.matrix-tianheng-screen \.explore-validation-summary-card\s*\{[^}]*position:\s*relative;/s);
  assert.match(tianhengCss, /\.matrix-tianheng-screen \.explore-validation-summary-card > \.explore-validation-consecutive-tag\s*\{[^}]*position:\s*absolute;[^}]*top:\s*2px;[^}]*right:\s*2px;[^}]*margin:\s*0;/s);
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

test('Matrix switcher artwork is not clipped on any edge', () => {
  const imageRule = exploreCss.match(/\.matrix-explore-main-screen \.matrix-settings-heading \.matrix-page-switcher img\s*\{([^}]*)\}/s)?.[1] ?? '';
  assert.ok(imageRule, 'expected the shared Matrix switcher image rule');
  assert.doesNotMatch(imageRule, /clip-path\s*:/);
});

test('all four Matrix validation tables use pure black column and row gaps', () => {
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
    /\.matrix-explore-main-screen \.explore-validation-(?:number-row|issue|formula-row):nth-child\(n \+ 2\)[^}]*border-top-color:\s*#000;/s,
  );
  assert.doesNotMatch(
    tiangongCss,
    /\.matrix-tiangong-screen \.explore-validation-(?:groups|group)[^{]*\{[^}]*background:\s*#02070C;/s,
  );
});
