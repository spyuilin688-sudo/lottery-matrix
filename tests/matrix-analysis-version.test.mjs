import assert from 'node:assert/strict';
import test from 'node:test';

import { analysisVersionForDrawPeriod } from '../backend/matrix-analysis-version.ts';

test('current-day Explore lookup does not invent an undefined analysis version', () => {
  assert.equal(analysisVersionForDrawPeriod(undefined), undefined);
});

test('historical Explore lookup keeps the exact draw-period analysis version', () => {
  assert.equal(analysisVersionForDrawPeriod('115000001'), '115000001:matrix-v3');
});
