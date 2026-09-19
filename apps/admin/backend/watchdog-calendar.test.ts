import { describe, expect, it } from 'vitest';
import {
  createIndependentWatchdog,
  planWatchdogActions,
  type WatchdogSnapshot,
} from './watchdog';

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

function watchdogFor(current: WatchdogSnapshot) {
  return createIndependentWatchdog({
    loadSnapshot: async () => [current],
    claimLease: async () => { throw new Error('unexpected lease claim'); },
    releaseLease: async () => { throw new Error('unexpected lease release'); },
    recoverRailway: async () => { throw new Error('unexpected Railway recovery'); },
    dispatchFantasy5: async () => { throw new Error('unexpected Fantasy5 dispatch'); },
  });
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

  it('reports no due heartbeat lottery when the canonical calendar excludes the legacy weekday', async () => {
    const current = snapshot(
      '六合彩',
      '026100',
      '2026-09-22',
      ['2026-09-22', '2026-09-26'],
    );

    const result = await watchdogFor(current).run(
      new Date('2026-09-24T13:43:00.000Z'),
      'test-non-draw-thursday',
    );

    expect(result.actions).toEqual([]);
    expect(result.dueLotteries).toEqual([]);
  });

  it('reports an explicit special draw date in heartbeat due lotteries', async () => {
    const current = snapshot(
      '今彩539',
      '115000217',
      '2026-09-06',
      ['2026-09-05', '2026-09-06', '2026-09-07'],
    );

    const result = await watchdogFor(current).run(
      new Date('2026-09-06T12:43:00.000Z'),
      'test-special-sunday',
    );

    expect(result.actions).toEqual([]);
    expect(result.dueLotteries).toEqual(['今彩539']);
  });
});

it.each([
 ['2026-09-19T12:43:00Z','2026-09-19T12:53:00.000Z'],
 ['2026-09-19T14:03:00Z','2026-09-19T14:33:00.000Z'],
 ['2026-09-19T17:33:00Z','2026-09-19T18:33:00.000Z'],
 ['2026-09-20T12:03:00Z','2026-09-21T12:43:00.000Z'],
])('reports next real checkpoint after %s',async(at,next)=>{
 const current=snapshot('今彩539','115000228','2026-09-19',['2026-09-19','2026-09-21']);
 const result=await watchdogFor(current).run(new Date(at),'schedule-test',{recover:false});
 expect(result).toHaveProperty('nextCheckAt',next);
});
