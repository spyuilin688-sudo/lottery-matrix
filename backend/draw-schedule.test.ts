import assert from 'node:assert/strict';
import test from 'node:test';

import { isFantasy5RefreshTime, nextDrawAtForDisplay, nextFantasy5DrawAt, nextTaipeiLotteryDrawAt } from './draw-schedule.ts';


test('Fantasy 5 next draw uses 09:30 Taipei during Pacific daylight time', () => {
  assert.equal(nextFantasy5DrawAt(new Date('2026-08-25T00:00:00Z')), '2026-08-25T01:30:00.000Z');
});

test('Fantasy 5 next draw uses 10:30 Taipei during Pacific standard time', () => {
  assert.equal(nextFantasy5DrawAt(new Date('2026-12-15T00:00:00Z')), '2026-12-15T02:30:00.000Z');
});

test('Fantasy 5 advances to the following Pacific draw after todays draw', () => {
  assert.equal(nextFantasy5DrawAt(new Date('2026-08-25T01:31:00Z')), '2026-08-26T01:30:00.000Z');
});

test('Fantasy 5 refresh runs only twenty minutes after the Pacific draw', () => {
  assert.equal(isFantasy5RefreshTime(new Date('2026-08-25T01:50:00Z')), true);
  assert.equal(isFantasy5RefreshTime(new Date('2026-08-25T01:45:00Z')), false);
  assert.equal(isFantasy5RefreshTime(new Date('2026-12-15T02:50:00Z')), true);
  assert.equal(isFantasy5RefreshTime(new Date('2026-12-15T01:50:00Z')), false);
});

test('Daily 539 next draw skips Sunday and stays at Taipei 20:30', () => {
  assert.equal(nextTaipeiLotteryDrawAt('今彩539', new Date('2026-08-22T13:00:00Z')), '2026-08-24T12:30:00.000Z');
});

test('Lotto 649 next draw uses Tuesday and Friday at Taipei 20:30', () => {
  assert.equal(nextTaipeiLotteryDrawAt('大樂透', new Date('2026-08-24T00:00:00Z')), '2026-08-25T12:30:00.000Z');
  assert.equal(nextTaipeiLotteryDrawAt('大樂透', new Date('2026-08-25T12:31:00Z')), '2026-08-28T12:30:00.000Z');
});

test('Fantasy 5 display ignores a crawler +20 minute cache', () => {
  assert.equal(
    nextDrawAtForDisplay('天天樂', '2026-08-25T01:50:00.000Z', new Date('2026-08-25T00:00:00Z')),
    '2026-08-25T01:30:00.000Z',
  );
  assert.equal(
    nextDrawAtForDisplay('天天樂', '2026-12-15T02:50:00.000Z', new Date('2026-12-15T00:00:00Z')),
    '2026-12-15T02:30:00.000Z',
  );
});

test('Other lotteries may use their cached next draw time', () => {
  assert.equal(
    nextDrawAtForDisplay('今彩539', '2026-08-25T12:30:00.000Z', new Date('2026-08-25T00:00:00Z')),
    '2026-08-25T12:30:00.000Z',
  );
});
