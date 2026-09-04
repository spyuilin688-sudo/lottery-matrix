import { describe, expect, it, vi } from 'vitest';
import {
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

  it('treats a draw newer than the pre-call target as already acquired', () => {
    expect(planWatchdogActions([
      healthy('天天樂', '11989', '2026-09-03'),
    ], new Date('2026-09-03T23:33:00.000Z'))).toEqual([]);
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
      reasons: ['analysis-missing'],
    }]);
  });
  it('does not replay an old failed job after the expected draw is present', () => {
    const snapshot = healthy('今彩539', '115000215', '2026-09-04');
    snapshot.job = { status: 'failed', startedAt: null, updatedAt: null };
    expect(planWatchdogActions([snapshot], new Date('2026-09-04T12:43:00.000Z'))).toEqual([]);
  });

  it('uses the analysis heartbeat and live lease instead of immutable start time', () => {
    const snapshot = healthy('天天樂', '11989', '2026-09-03');
    snapshot.latestAnalysis = {
      drawPeriod: '11989',
      status: 'running',
      startedAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T08:55:00.000Z',
      leaseExpiresAt: '2026-09-04T09:20:00.000Z',
    };
    expect(planWatchdogActions([snapshot], new Date('2026-09-04T09:00:00.000Z'))).toEqual([]);
  });

  it('recovers running analysis only after heartbeat and lease both expire', () => {
    const snapshot = healthy('天天樂', '11989', '2026-09-03');
    snapshot.latestAnalysis = {
      drawPeriod: '11989',
      status: 'running',
      startedAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T08:00:00.000Z',
      leaseExpiresAt: '2026-09-04T08:30:00.000Z',
    };
    expect(planWatchdogActions(
      [snapshot],
      new Date('2026-09-04T09:00:00.000Z'),
    )).toEqual([{
      lottery: '天天樂',
      target: 'railway',
      reasons: ['analysis-stuck'],
    }]);
  });

  it('uses the actual Los Angeles DST transition in March', () => {
    expect(planWatchdogActions([
      healthy('天天樂', '11988', '2026-03-06'),
    ], new Date('2026-03-08T02:43:00.000Z'))).toEqual([{
      lottery: '天天樂',
      target: 'github',
      reasons: ['crawler-stale'],
    }]);
    expect(planWatchdogActions([
      healthy('天天樂', '11989', '2026-03-07'),
    ], new Date('2026-03-09T01:43:00.000Z'))).toEqual([{
      lottery: '天天樂',
      target: 'github',
      reasons: ['crawler-stale'],
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
      claimLease: async () => true,
      releaseLease: async () => undefined,
      recoverRailway,
      dispatchFantasy5,
    });

    await expect(watchdog.run(
      new Date('2026-09-04T09:00:00.000Z'),
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
      new Date('2026-09-04T09:00:00.000Z'),
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
      new Date('2026-09-04T09:00:00.000Z'),
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
