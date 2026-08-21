import { describe, expect, it } from 'vitest';
import { completedEnvelope } from './matrix-contracts';

describe('Matrix analysis contracts', () => {
  it('requires one analysis version and draw period on every completed response', () => {
    expect(
      completedEnvelope('explore', '今彩539', '114000123', '114000123:v1', [1]),
    ).toEqual({
      kind: 'explore',
      lottery: '今彩539',
      drawPeriod: '114000123',
      analysisVersion: '114000123:v1',
      status: 'complete',
      data: [1],
    });
  });
});
