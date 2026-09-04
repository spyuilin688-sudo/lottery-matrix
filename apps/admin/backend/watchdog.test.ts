import { describe, expect, it, vi } from 'vitest';
import {
  buildWatchdogPhasePlan,
  createFantasy5GithubDispatcher,
  createIndependentWatchdog,
  createSupabaseWatchdogLeaseManager,
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
    updatedAt: '2026-09-04T00:03:00.000Z',
    leaseExpiresAt: null,
  },
});

const minutesAfter = (value: Date, minutes: number) =>
  new Date(value.getTime() + minutes * 60_000);

const plannedAtOffsets = (
  snapshot: WatchdogSnapshot,
  cycleCall: Date,
  firstOffset: number,
  lastOffset: number,
) => {
  const offsets: number[] = [];
  for (let offset = firstOffset; offset <= lastOffset; offset += 6) {
    if (planWatchdogActions([snapshot], minutesAfter(cycleCall, offset)).length > 0) {
      offsets.push(offset);
    }
  }
  return offsets;
};

describe('independent Matrix watchdog planning', () => {
  it('schedules exactly 128 checkpoints across the 6, 10, and 30 minute phases', () => {
    const checkpoints = buildWatchdogPhasePlan();
    const cycleCall = new Date('2026-09-05T12:33:00.000Z');
    const stale = healthy('今彩539', '115000215', '2026-09-04');
    const offsets = plannedAtOffsets(stale, cycleCall, 6, 1_446);

    const sixMinutePhase = checkpoints.slice(0, 50);
    const tenMinutePhase = checkpoints.slice(50, 110);
    const thirtyMinutePhase = checkpoints.slice(110);

    expect(checkpoints).toHaveLength(128);
    expect(sixMinutePhase).toHaveLength(50);
    expect([sixMinutePhase[0], sixMinutePhase.at(-1)]).toEqual([6, 300]);
    expect(tenMinutePhase).toHaveLength(60);
    expect([tenMinutePhase[0], tenMinutePhase.at(-1)]).toEqual([310, 900]);
    expect(thirtyMinutePhase).toHaveLength(18);
    expect([thirtyMinutePhase[0], thirtyMinutePhase.at(-1)]).toEqual([930, 1_440]);
    expect(offsets).toHaveLength(128);
    expect(offsets).not.toContain(306);
    expect(offsets).not.toContain(906);
    expect(offsets).not.toContain(1_446);
  });

  it('assigns each 10 minute checkpoint to only the immediately following 6 minute tick', () => {
    const cycleCall = new Date('2026-09-05T12:33:00.000Z');
    const stale = healthy('今彩539', '115000215', '2026-09-04');
    const logicalDueOffsets = Array.from({ length: 60 }, (_, index) => 310 + index * 10);
    const claimedDueOffsets: number[] = [];
    const delays: number[] = [];

    for (let physicalOffset = 306; physicalOffset <= 906; physicalOffset += 6) {
      const dueInPreviousInterval = logicalDueOffsets.filter(
        (dueOffset) => dueOffset > physicalOffset - 6 && dueOffset <= physicalOffset,
      );
      const actions = planWatchdogActions([stale], minutesAfter(cycleCall, physicalOffset));
      expect(actions.length > 0).toBe(dueInPreviousInterval.length > 0);
      for (const dueOffset of dueInPreviousInterval) {
        claimedDueOffsets.push(dueOffset);
        delays.push(physicalOffset - dueOffset);
      }
    }

    expect(claimedDueOffsets).toEqual(logicalDueOffsets);
    expect(new Set(claimedDueOffsets).size).toBe(60);
    expect(Math.max(...delays)).toBe(4);
    expect(new Set(delays)).toEqual(new Set([0, 2, 4]));
  });

  it('handles non-draw days, midnight crossing, California DST, and the next draw cycle', () => {
    const stale539 = healthy('今彩539', '115000215', '2026-09-04');
    const currentThroughSaturday = healthy('今彩539', '115000216', '2026-09-05');
    expect(planWatchdogActions(
      [stale539],
      new Date('2026-09-05T17:45:00.000Z'),
    )).toEqual([{
      lottery: '今彩539',
      target: 'railway',
      reasons: ['crawler-stale'],
    }]);
    expect(planWatchdogActions(
      [currentThroughSaturday],
      new Date('2026-09-06T12:39:00.000Z'),
    )).toEqual([]);
    expect(planWatchdogActions(
      [currentThroughSaturday],
      new Date('2026-09-07T12:39:00.000Z'),
    )).toEqual([{
      lottery: '今彩539',
      target: 'railway',
      reasons: ['crawler-stale'],
    }]);

    expect(planWatchdogActions([
      healthy('天天樂', '11988', '2026-03-06'),
    ], new Date('2026-03-08T02:45:00.000Z'))).toEqual([{
      lottery: '天天樂',
      target: 'github',
      reasons: ['crawler-stale'],
    }]);
    expect(planWatchdogActions([
      healthy('天天樂', '11989', '2026-03-07'),
    ], new Date('2026-03-09T01:45:00.000Z'))).toEqual([{
      lottery: '天天樂',
      target: 'github',
      reasons: ['crawler-stale'],
    }]);
  });

  it('does nothing when the latest draw and its analysis are complete', () => {
    expect(planWatchdogActions([
      healthy('天天樂', '11989', '2026-09-03'),
    ], new Date('2026-09-04T01:45:00.000Z'))).toEqual([]);
  });

  it('dispatches only GitHub when Fantasy5 is stale at a due checkpoint', () => {
    expect(planWatchdogActions([
      healthy('天天樂', '11988', '2026-09-02'),
    ], new Date('2026-09-04T01:45:00.000Z'))).toEqual([{
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
      new Date('2026-09-04T01:45:00.000Z'),
    )).toEqual([{
      lottery: '天天樂',
      target: 'railway',
      reasons: ['analysis-missing'],
    }]);
  });

  it('recovers a Railway-owned crawler when the due draw is stale', () => {
    expect(planWatchdogActions([
      healthy('今彩539', '115000214', '2026-09-03'),
    ], new Date('2026-09-04T12:39:00.000Z'))).toEqual([{
      lottery: '今彩539',
      target: 'railway',
      reasons: ['crawler-stale'],
    }]);
  });

  it('uses the 大樂透 20:53 call time before scheduling recovery', () => {
    expect(planWatchdogActions([
      healthy('大樂透', '115000214', '2026-09-03'),
    ], new Date('2026-09-04T12:59:00.000Z'))).toEqual([{
      lottery: '大樂透',
      target: 'railway',
      reasons: ['crawler-stale'],
    }]);
  });

  it('does not crawl a stale draw outside a due checkpoint', () => {
    expect(planWatchdogActions([
      healthy('天天樂', '11988', '2026-09-02'),
    ], new Date('2026-09-04T08:00:00.000Z'))).toEqual([]);
  });

  it('treats the due draw as already acquired', () => {
    expect(planWatchdogActions([
      healthy('天天樂', '11989', '2026-09-03'),
    ], new Date('2026-09-04T01:45:00.000Z'))).toEqual([]);
  });

  it('deduplicates crawler and analysis failures into one Railway recovery', () => {
    const snapshot = healthy('今彩539', '115000214', '2026-09-03');
    snapshot.job = { status: 'failed', startedAt: null, updatedAt: null };
    snapshot.latestAnalysis = null;
    expect(planWatchdogActions(
      [snapshot],
      new Date('2026-09-04T12:39:00.000Z'),
    )).toEqual([{
      lottery: '今彩539',
      target: 'railway',
      reasons: ['job-failed', 'crawler-stale', 'analysis-missing'],
    }]);
  });
  it('does not replay an old failed job after the expected draw is present', () => {
    const snapshot = healthy('今彩539', '115000215', '2026-09-04');
    snapshot.job = { status: 'failed', startedAt: null, updatedAt: null };
    expect(planWatchdogActions([snapshot], new Date('2026-09-04T12:39:00.000Z'))).toEqual([]);
  });

  it('uses the analysis heartbeat and live lease instead of immutable start time', () => {
    const snapshot = healthy('天天樂', '11989', '2026-09-03');
    snapshot.latestAnalysis = {
      drawPeriod: '11989',
      status: 'running',
      startedAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T01:40:00.000Z',
      leaseExpiresAt: '2026-09-04T02:05:00.000Z',
    };
    expect(planWatchdogActions([snapshot], new Date('2026-09-04T01:45:00.000Z'))).toEqual([]);
  });

  it('recovers running analysis only after heartbeat and lease both expire', () => {
    const snapshot = healthy('天天樂', '11989', '2026-09-03');
    snapshot.latestAnalysis = {
      drawPeriod: '11989',
      status: 'running',
      startedAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:30:00.000Z',
      leaseExpiresAt: '2026-09-04T01:00:00.000Z',
    };
    expect(planWatchdogActions(
      [snapshot],
      new Date('2026-09-04T01:45:00.000Z'),
    )).toEqual([{
      lottery: '天天樂',
      target: 'railway',
      reasons: ['analysis-stuck'],
    }]);
  });

  it('uses the actual Los Angeles DST transition in March', () => {
    expect(planWatchdogActions([
      healthy('天天樂', '11988', '2026-03-06'),
    ], new Date('2026-03-08T02:45:00.000Z'))).toEqual([{
      lottery: '天天樂',
      target: 'github',
      reasons: ['crawler-stale'],
    }]);
    expect(planWatchdogActions([
      healthy('天天樂', '11989', '2026-03-07'),
    ], new Date('2026-03-09T01:45:00.000Z'))).toEqual([{
      lottery: '天天樂',
      target: 'github',
      reasons: ['crawler-stale'],
    }]);
  });

  it('uses the post-fall-DST Fantasy5 call time without overlapping an older cycle', () => {
    expect(planWatchdogActions([
      healthy('天天樂', '12044', '2026-10-31'),
    ], new Date('2026-11-02T02:39:00.000Z'))).toEqual([{
      lottery: '天天樂',
      target: 'github',
      reasons: ['crawler-stale'],
    }]);
  });

  it('prefers the newer Fantasy5 cycle when spring DST checkpoints overlap', () => {
    for (const checkedAt of [
      '2026-03-09T02:03:00.000Z',
      '2026-03-09T02:33:00.000Z',
    ]) {
      expect(planWatchdogActions([
        healthy('天天樂', '11989', '2026-03-07'),
      ], new Date(checkedAt))).toEqual([{
        lottery: '天天樂',
        target: 'github',
        reasons: ['crawler-stale'],
      }]);
    }
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
      claimLease: async () => true,
      releaseLease: async () => undefined,
      recoverRailway,
      dispatchFantasy5,
    });

    await expect(watchdog.run(
      new Date('2026-09-04T01:45:00.000Z'),
      'invocation-1',
    )).resolves.toMatchObject({
      status: 'ok',
      actions: [{
        lottery: '天天樂',
        target: 'railway',
        outcome: 'accepted',
      }],
    });
    expect(recoverRailway).toHaveBeenCalledWith('天天樂', 'invocation-1');
    expect(dispatchFantasy5).not.toHaveBeenCalled();
  });
  it('does not execute an action while another host owns its lease', async () => {
    const recoverRailway = vi.fn(async () => ({ status: 'accepted' }));
    const snapshot = healthy('天天樂', '11989', '2026-09-03');
    snapshot.latestAnalysis = null;
    const watchdog = createIndependentWatchdog({
      loadSnapshot: async () => [snapshot],
      claimLease: async () => false,
      releaseLease: async () => undefined,
      recoverRailway,
      dispatchFantasy5: vi.fn(async () => 'dispatched'),
    });
    await expect(watchdog.run(
      new Date('2026-09-04T01:45:00.000Z'),
      'invocation-2',
    )).resolves.toMatchObject({
      status: 'ok',
      actions: [{ outcome: 'lease-held' }],
    });
    expect(recoverRailway).not.toHaveBeenCalled();
  });

  it('retains an acquired lease when Railway acceptance is ambiguous', async () => {
    const releaseLease = vi.fn(async () => undefined);
    const snapshot = healthy('天天樂', '11989', '2026-09-03');
    snapshot.latestAnalysis = null;
    const watchdog = createIndependentWatchdog({
      loadSnapshot: async () => [snapshot],
      claimLease: async () => true,
      releaseLease,
      recoverRailway: vi.fn(async () => { throw new Error('offline'); }),
      dispatchFantasy5: vi.fn(async () => 'dispatched'),
    });
    await expect(watchdog.run(
      new Date('2026-09-04T01:45:00.000Z'),
      'invocation-3',
    )).resolves.toMatchObject({
      status: 'degraded',
      actions: [{ outcome: 'failed' }],
    });
    expect(releaseLease).not.toHaveBeenCalled();
  });

  it('claims cross-host leases through one atomic Supabase RPC', async () => {
    const supabaseRequest = vi.fn(async () => true);
    const leases = createSupabaseWatchdogLeaseManager({ supabaseRequest });
    await expect(leases.claim('github:天天樂', 'invocation-4')).resolves.toBe(true);
    expect(supabaseRequest).toHaveBeenCalledWith(
      'rpc/claim_matrix_watchdog_lease',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          p_lease_key: 'github:天天樂',
          p_owner_id: 'invocation-4',
          p_ttl_seconds: 1200,
        }),
      }),
    );
  });

  it('times out a stalled GitHub workflow response body', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(async () => ({
        ok: true,
        json: () => new Promise(() => undefined),
      } as Response));
      const dispatch = createFantasy5GithubDispatcher(
        async () => 'server-token',
        fetcher as typeof fetch,
      );
      const pending = dispatch();
      await vi.advanceTimersByTimeAsync(8_000);
      await expect(pending).resolves.toBe('failed');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

});
