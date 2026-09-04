import { describe, expect, it, vi } from 'vitest';
import {
  createFantasy5GithubDispatcher,
  createIndependentWatchdog,
  planWatchdogActions,
  type WatchdogSnapshot,
} from './watchdog';

const healthy = (
  lottery: WatchdogSnapshot['lottery'],
  period: string,
  drawDate: string,
): WatchdogSnapshot => ({
  lottery,
  job: {
    status: 'success',
    startedAt: '2026-09-04T00:00:00.000Z',
    updatedAt: '2026-09-04T00:01:00.000Z',
  },
  latestDraw: { period, drawDate },
  latestAnalysis: {
    drawPeriod: period,
    status: 'complete',
    startedAt: '2026-09-04T00:02:00.000Z',
  },
});

describe('independent Matrix watchdog planning', () => {
  it('does nothing when the latest draw and its analysis are complete', () => {
    expect(planWatchdogActions([
      healthy('天天樂', '11989', '2026-09-03'),
    ], new Date('2026-09-04T01:43:00.000Z'))).toEqual([]);
  });

  it('dispatches only GitHub when Fantasy5 is stale during its call window', () => {
    expect(planWatchdogActions([
      healthy('天天樂', '11988', '2026-09-02'),
    ], new Date('2026-09-04T01:43:00.000Z'))).toEqual([{
      lottery: '天天樂',
      target: 'github',
      reasons: ['crawler-stale'],
    }]);
  });

  it('recovers Fantasy5 analysis on Railway without asking GitHub to run algorithms', () => {
    const snapshot = healthy('天天樂', '11989', '2026-09-03');
    snapshot.latestAnalysis = null;
    expect(planWatchdogActions(
      [snapshot],
      new Date('2026-09-04T09:00:00.000Z'),
    )).toEqual([{
      lottery: '天天樂',
      target: 'railway',
      reasons: ['analysis-missing'],
    }]);
  });

  it('recovers a Railway-owned crawler when the due draw is stale', () => {
    expect(planWatchdogActions([
      healthy('今彩539', '115000214', '2026-09-03'),
    ], new Date('2026-09-04T12:43:00.000Z'))).toEqual([{
      lottery: '今彩539',
      target: 'railway',
      reasons: ['crawler-stale'],
    }]);
  });

  it('does not crawl a stale draw outside the configured call window', () => {
    expect(planWatchdogActions([
      healthy('天天樂', '11988', '2026-09-02'),
    ], new Date('2026-09-04T08:00:00.000Z'))).toEqual([]);
  });

  it('deduplicates crawler and analysis failures into one Railway recovery', () => {
    const snapshot = healthy('今彩539', '115000214', '2026-09-03');
    snapshot.job = { status: 'failed', startedAt: null, updatedAt: null };
    snapshot.latestAnalysis = null;
    expect(planWatchdogActions(
      [snapshot],
      new Date('2026-09-04T09:00:00.000Z'),
    )).toEqual([{
      lottery: '今彩539',
      target: 'railway',
      reasons: ['job-failed', 'analysis-missing'],
    }]);
  });
});

describe('independent Matrix watchdog execution', () => {
  it('keeps GitHub optional until the server-only Actions token is configured', async () => {
    const fetcher = vi.fn();
    const dispatch = createFantasy5GithubDispatcher(async () => null, fetcher as typeof fetch);
    await expect(dispatch()).resolves.toBe('config-missing');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('runs only the planned recovery target and reports safe outcomes', async () => {
    const recoverRailway = vi.fn(async () => ({ status: 'accepted' }));
    const dispatchFantasy5 = vi.fn(async () => 'dispatched');
    const watchdog = createIndependentWatchdog({
      loadSnapshot: async () => [{
        ...healthy('天天樂', '11989', '2026-09-03'),
        latestAnalysis: null,
      }],
      recoverRailway,
      dispatchFantasy5,
    });

    await expect(watchdog.run(new Date('2026-09-04T09:00:00.000Z'))).resolves.toMatchObject({
      status: 'ok',
      actions: [{
        lottery: '天天樂',
        target: 'railway',
        outcome: 'accepted',
      }],
    });
    expect(recoverRailway).toHaveBeenCalledWith('天天樂');
    expect(dispatchFantasy5).not.toHaveBeenCalled();
  });
});
