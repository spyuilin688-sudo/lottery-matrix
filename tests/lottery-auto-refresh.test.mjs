import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('latest draw refreshes immediately and every 60 seconds', () => {
  const source = readFileSync(new URL('../src/useLatestLotteryDraw.ts', import.meta.url), 'utf8');
  assert.match(source, /const refreshLatestDraw\s*=\s*\(\)\s*=>/);
  assert.match(source, /refreshLatestDraw\(\);/);
  assert.match(source, /window\.setInterval\(refreshLatestDraw,\s*60_000\)/);
  assert.match(source, /window\.clearInterval\(refreshTimer\)/);
});

test('lottery history refreshes immediately and every 60 seconds', () => {
  const source = readFileSync(new URL('../src/FeaturePages.tsx', import.meta.url), 'utf8');
  assert.match(source, /const refreshLotteryHistory\s*=\s*\(\)\s*=>/);
  assert.match(source, /refreshLotteryHistory\(\);/);
  assert.match(source, /window\.setInterval\(refreshLotteryHistory,\s*60_000\)/);
  assert.match(source, /window\.clearInterval\(refreshTimer\)/);
});
