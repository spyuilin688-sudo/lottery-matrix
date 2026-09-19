import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('latest draw refreshes immediately and subscribes to the shared lottery cadence', () => {
  const source = readFileSync(new URL('../src/useLatestLotteryDraw.ts', import.meta.url), 'utf8');
  assert.match(source, /const refreshLatestDraw\s*=\s*\(\)\s*=>/);
  assert.match(source, /refreshLatestDraw\(\);/);
  assert.match(source, /const unsubscribe = subscribeLotteryRefresh\(lottery, refreshLatestDraw\)/);
  assert.match(source, /active = false;\s*unsubscribe\(\)/);
  assert.doesNotMatch(source, /setInterval\(/);
});

test('lottery history refreshes immediately and releases its shared subscription', () => {
  const source = readFeaturePagesSource();
  assert.match(source, /const refreshLotteryHistory\s*=\s*\(\)\s*=>/);
  assert.match(source, /refreshLotteryHistory\(\);/);
  assert.match(source, /const unsubscribe = subscribeLotteryRefresh\(lottery, refreshLotteryHistory\)/);
  assert.match(source, /active = false;\s*unsubscribe\(\)/);
});

test('shared lottery cadence is hourly and stops when its last reader leaves', () => {
  const source = readFileSync(new URL('../src/lottery-data-refresh.ts', import.meta.url), 'utf8');
  assert.match(source, /setInterval\(refresh, 3_600_000\)/);
  assert.match(source, /clearInterval\(timer\)/);
  assert.match(source, /group\.listeners\.size === 0[\s\S]*group\.dispose\(\)[\s\S]*groups\.delete\(lottery\)/);
});
