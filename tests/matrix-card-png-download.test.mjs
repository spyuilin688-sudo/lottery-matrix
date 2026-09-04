import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const featurePages = readFileSync(new URL('../src/FeaturePages.tsx', import.meta.url), 'utf8');
const downloadHelper = readFileSync(new URL('../src/matrix-ticket-download.ts', import.meta.url), 'utf8');

function matrixCardPageSource() {
  const start = featurePages.indexOf('export function MatrixCardPage');
  const end = featurePages.indexOf('const GUIDE_LOOP_GROUPS', start);
  assert.notEqual(start, -1, 'MatrixCardPage source must exist');
  assert.notEqual(end, -1, 'MatrixCardPage source boundary must exist');
  return featurePages.slice(start, end);
}

test('MatrixCardPage prepares and downloads the current PNG explicitly', () => {
  const source = matrixCardPageSource();

  assert.match(featurePages, /import\s*\{[^}]*downloadMatrixCardPng[^}]*refreshMatrixCardPng[^}]*\}\s*from\s*["']\.\/matrix-ticket-download["']/s);
  assert.match(source, /refreshMatrixCardPng\s*\(\s*cardUrl\s*\)/);
  assert.match(source, /\[\s*cardUrl\s*,\s*cardPeriod\s*\]/);
  assert.match(source, /await\s+downloadMatrixCardPng\s*\(/);
  assert.match(source, /牌單\.png/);
  assert.doesNotMatch(source, /牌單\.svg/);
  assert.doesNotMatch(source, /anchor\.download\s*=/);
});

test('matrix card helper owns PNG encoding but not page DOM observation or short-timer revocation', () => {
  assert.match(downloadHelper, /export\s+async\s+function\s+downloadMatrixCardPng\s*\(/);
  assert.match(downloadHelper, /export\s+function\s+refreshMatrixCardPng\s*\(/);
  assert.match(downloadHelper, /canvasToPng\s*\(/);
  assert.match(downloadHelper, /validatePng\s*\(/);
  assert.match(downloadHelper, /image\/png/);
  assert.doesNotMatch(downloadHelper, /MutationObserver/);
  assert.doesNotMatch(downloadHelper, /MATRIX_CARD_DOWNLOAD_URL_REVOKE_MS/);
});
