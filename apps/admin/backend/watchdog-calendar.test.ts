import { describe, expect, it } from 'vitest';
import { planWatchdogActions, type WatchdogSnapshot } from './watchdog';

function snapshot(
  lottery: WatchdogSnapshot['lottery'],
  period: string,
  drawDate: string,
  drawDays: string[],
): WatchdogSnapshot {
  return {
    lottery,
    drawDays,
    job: {
      status: 'success',
      startedAt: '2026-09-24T00:00:00.000Z',
      updatedAt: '2026-09-24T00:01:00.000Z',
    },
    latestDraw: { period, drawDate },
    latestAnalysis: {
      drawPeriod: period,
      status: 'complete',
      startedAt: '2026-09-24T00:02:00.000Z',
      updatedAt: '2026-09-24T00:03:00.000Z',
      leaseExpiresAt: null,
    },
  };
}

describe('watchdog canonical draw-day calendar', () => {
  it('does not recover Mark Six on an official non-draw Thursday', () => {
    const stale = snapshot(
      '六合彩',
      '026100',
      '2026-09-22',
      ['2026-09-22', '2026-09-26'],
    );

    expect(planWatchdogActions(
      [stale],
      new Date('2026-09-24T13:43:00.000Z'),
    )).toEqual([]);
  });

  it('does recover 539 on an explicit special Sunday draw date', () => {
    const stale = snapshot(
      '今彩539',
      '115000216',
      '2026-09-05',
      ['2026-09-05', '2026-09-06', '2026-09-07'],
    );

    expect(planWatchdogActions(
      [stale],
      new Date('2026-09-06T12:43:00.000Z'),
    )).toEqual([{
      lottery: '今彩539',
      target: 'railway',
      reasons: ['crawler-stale'],
    }]);
  });
});
