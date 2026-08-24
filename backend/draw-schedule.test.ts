import assert from 'node:assert/strict';
import test from 'node:test';

import { nextFantasy5DrawAt } from './draw-schedule.ts';


test('Fantasy 5 next draw uses 09:30 Taipei during Pacific daylight time', () => {
  assert.equal(nextFantasy5DrawAt(new Date('2026-08-25T00:00:00Z')), '2026-08-25T01:30:00.000Z');
});

test('Fantasy 5 next draw uses 10:30 Taipei during Pacific standard time', () => {
  assert.equal(nextFantasy5DrawAt(new Date('2026-12-15T00:00:00Z')), '2026-12-15T02:30:00.000Z');
});

test('Fantasy 5 advances to the following Pacific draw after todays draw', () => {
  assert.equal(nextFantasy5DrawAt(new Date('2026-08-25T01:31:00Z')), '2026-08-26T01:30:00.000Z');
});
