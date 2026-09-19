import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('latest draw refreshes immediately and releases its shared refresh subscription', () => {
  const source = readFileSync(new URL('../src/useLatestLotteryDraw.ts', import.meta.url), 'utf8');
  assert.match(source, /const refreshLatestDraw\s*=\s*\(\)\s*=>/);
  assert.match(source, /refreshLatestDraw\(\);/);
  assert.match(source, /const unsubscribe = subscribeLotteryRefresh\(lottery, refreshLatestDraw\)/);
  assert.match(source, /active = false;\s+unsubscribe\(\);/);
  assert.doesNotMatch(source, /setInterval/);
});

test('lottery history refreshes immediately and releases its shared refresh subscription', () => {
  const source = readFileSync(new URL('../src/features/shared.tsx', import.meta.url), 'utf8');
  assert.match(source, /const refreshLotteryHistory\s*=\s*\(\)\s*=>/);
  assert.match(source, /refreshLotteryHistory\(\);/);
  assert.match(source, /const unsubscribe = subscribeLotteryRefresh\(lottery, refreshLotteryHistory\)/);
  assert.match(source, /active = false;\s+unsubscribe\(\);/);
});

test('shared draw refresh keeps the approved hourly fallback and event-driven refreshes', () => {
  // The accepted cadence is recorded in docs/qa/2026-09-14-resumed-verification.md.
  const source = readFileSync(new URL('../src/lottery-data-refresh.ts', import.meta.url), 'utf8');
  assert.match(source, /setInterval\(refresh,\s*3_600_000\)/);
  assert.match(source, /document\.visibilityState === 'hidden'/);
  assert.match(source, /subscribeMatrixDataRevision\(queueRefresh\)/);
  for (const event of ['visibilitychange', 'online']) {
    assert.match(source, new RegExp(`addEventListener\\('${event}', queueRefresh\\)`));
    assert.match(source, new RegExp(`removeEventListener\\('${event}', queueRefresh\\)`));
  }
  assert.match(source, /clearInterval\(timer\)/);
  assert.match(source, /if \(group\.listeners\.size === 0\)\s*\{\s*group\.dispose\(\);\s*groups\.delete\(lottery\);/);
});
