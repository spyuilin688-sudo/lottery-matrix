import { describe, expect, it, vi } from 'vitest';
import {
  buildWatchdogPhasePlan,
  createFantasy5GithubDispatcher,
  createIndependentWatchdog,
  createSupabaseWatchdogLeaseManager,
  expectedDrawDateForDueWindow,
  planWatchdogActions,
  type WatchdogSnapshot,
} from './watchdog';
import { evaluateChain, CHAIN_STAGES } from './matrix-chain';

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
  for (let offset = firstOffset; offset <= lastOffset; offset += 10) {
    if (planWatchdogActions([snapshot], minutesAfter(cycleCall, offset)).length > 0) {
      offsets.push(offset);
    }
  }
  return offsets;
};

describe('independent Matrix watchdog planning', () => {
  it('sends a complete confirmed draw with only a missing card to card repair', async () => {
    const at = new Date('2026-09-04T12:43:00.000Z');
    const snapshot = healthy('今彩539', '115000215', '2026-09-04');
    snapshot.latestDraw = { ...snapshot.latestDraw!, resultStatus: 'confirmed', drawOrderAvailable: true };
    snapshot.cardComplete = false;
    snapshot.chain = evaluateChain({
      lottery: '今彩539', drawPeriod: '115000215', checkedAt: at.toISOString(),
      stages: CHAIN_STAGES.map((stage) => ({
        stage, state: (stage === 'card' ? 'FAIL' : 'PASS') as 'FAIL' | 'PASS', source: 'supabase',
        observedAt: at.toISOString(), period: '115000215', code: 'READY',
      })),
    });
    const recoverRailway = vi.fn(async () => ({ status: 'accepted' }));
    const watchdog = createIndependentWatchdog({
      loadSnapshot: async () => [snapshot],
      claimLease: async () => true,
      releaseLease: async () => undefined,
      recoverRailway,
      dispatchFantasy5: async () => 'unused',
    });
    const result = await watchdog.run(at, 'card-invocation');
    expect(result.status).toBe('degraded');
    expect(result).toMatchObject({
      recoveryReports: [expect.objectContaining({
        state: 'FAIL', stages: expect.arrayContaining([expect.objectContaining({ stage: 'card', state: 'FAIL' })]),
      })],
    });
    expect(recoverRailway).toHaveBeenCalledWith('今彩539', 'card-invocation', {
      stage: 'card', drawPeriod: '115000215',
    });
  });

  it('sends a confirmed draw missing its actual order to source repair', () => {
    const snapshot = healthy('今彩539', '115000215', '2026-09-04');
    snapshot.latestDraw = { ...snapshot.latestDraw!, resultStatus: 'confirmed', drawOrderAvailable: false };
    snapshot.cardComplete = false;
    expect(planWatchdogActions([snapshot], new Date('2026-09-04T12:43:00.000Z'))).toEqual([{
      lottery: '今彩539', target: 'railway', reasons: ['crawler-stale'],
    }]);
  });

  it('does not repair a preliminary sorted card before the formal result arrives', () => {
    const snapshot = healthy('今彩539', '115000215', '2026-09-04');
    snapshot.latestDraw = { ...snapshot.latestDraw!, resultStatus: 'preliminary', drawOrderAvailable: false };
    snapshot.cardComplete = false;
    expect(planWatchdogActions([snapshot], new Date('2026-09-04T12:43:00.000Z'))).toEqual([{
      lottery: '今彩539', target: 'railway', reasons: ['crawler-stale'],
    }]);
  });
  it('uses exact ten/fifty minute offsets and the two extra evening checks', () => {
    expect(buildWatchdogPhasePlan()).toEqual([
      ...Array.from({length:27},(_,i)=>i*10),270,320,370,420,470,520,930,1290,
    ]);
    const stale=healthy('今彩539','old','2026-09-04');
    expect(plannedAtOffsets(stale,new Date('2026-09-05T12:30:00Z'),0,1430)).toEqual(buildWatchdogPhasePlan());
  });
  it('starts at20:30 and does not run before the opening',()=>{
    const stale=healthy('今彩539','old','2026-09-04');
    expect(planWatchdogActions([stale],new Date('2026-09-05T12:29:00Z'))).toEqual([]);
    expect(planWatchdogActions([stale],new Date('2026-09-05T12:30:00Z'))).toHaveLength(1);
  });

  it('runs Mark Six only on Tuesday, Thursday, Saturday, and Sunday fallback windows', () => {
    const stale = healthy('六合彩', '026095', '2026-09-03');
    expect(planWatchdogActions([stale], new Date('2026-09-07T13:43:00.000Z'))).toEqual([]);
    expect(planWatchdogActions([stale], new Date('2026-09-08T13:43:00.000Z'))).toHaveLength(1);
    expect(planWatchdogActions([stale], new Date('2026-09-09T13:43:00.000Z'))).toEqual([]);
    expect(planWatchdogActions([stale], new Date('2026-09-10T13:43:00.000Z'))).toHaveLength(1);
  });

  it('does not replay a Sunday Mark Six fallback when Saturday is already stored', () => {
    expect(planWatchdogActions([
      healthy('六合彩', '026096', '2026-09-05'),
    ], new Date('2026-09-06T13:43:00.000Z'))).toEqual([]);
  });

  it('continues Saturday Mark Six on the same requested evening cycle', () => {
    const stale = healthy('六合彩', '026095', '2026-09-03');
    expect(planWatchdogActions([stale], new Date('2026-09-05T15:03:00.000Z'))).toHaveLength(1);
    expect(planWatchdogActions([stale], new Date('2026-09-05T15:13:00.000Z'))).toHaveLength(1);
  });

  it('handles non-draw days, midnight crossing, California DST, and the next draw cycle', () => {
    const stale539 = healthy('今彩539', '115000215', '2026-09-04');
    const currentThroughSaturday = healthy('今彩539', '115000216', '2026-09-05');
    expect(planWatchdogActions(
      [stale539],
      new Date('2026-09-05T18:43:00.000Z'),
    )).toEqual([{
      lottery: '今彩539',
      target: 'railway',
      reasons: ['crawler-stale'],
    }]);
    expect(planWatchdogActions(
      [currentThroughSaturday],
      new Date('2026-09-06T12:43:00.000Z'),
    )).toEqual([]);
    expect(planWatchdogActions(
      [currentThroughSaturday],
      new Date('2026-09-07T12:43:00.000Z'),
    )).toEqual([{
      lottery: '今彩539',
      target: 'railway',
      reasons: ['crawler-stale'],
    }]);

    expect(planWatchdogActions([
      healthy('天天樂', '11988', '2026-03-06'),
    ], new Date('2026-03-08T02:43:00.000Z'))).toEqual([{
      lottery: '天天樂',
      target: 'railway',
      reasons: ['crawler-stale'],
    }]);
    expect(planWatchdogActions([
      healthy('天天樂', '11989', '2026-03-07'),
    ], new Date('2026-03-09T01:43:00.000Z'))).toEqual([{
      lottery: '天天樂',
      target: 'railway',
      reasons: ['crawler-stale'],
    }]);
  });

  it('does nothing when the latest draw and its analysis are complete', () => {
    expect(planWatchdogActions([
      healthy('天天樂', '11989', '2026-09-04'),
    ], new Date('2026-09-04T01:43:00.000Z'))).toEqual([]);
  });

  it('recovers on Railway when the current Taipei Fantasy5 draw is missing', () => {
    expect(planWatchdogActions([
      healthy('天天樂', '11990', '2026-09-05'),
    ], new Date('2026-09-06T01:43:00.000Z'))).toEqual([{
      lottery: '天天樂',
      target: 'railway',
      reasons: ['crawler-stale'],
    }]);
  });

  it('uses only Railway recovery when Fantasy5 is stale at a due checkpoint', () => {
    expect(planWatchdogActions([
      healthy('天天樂', '11988', '2026-09-02'),
    ], new Date('2026-09-04T01:43:00.000Z'))).toEqual([{
      lottery: '天天樂',
      target: 'railway',
      reasons: ['crawler-stale'],
    }]);
  });

  it('does not dispatch recovery while the crawler heartbeat is fresh', () => {
    const snapshot = healthy('天天樂', '11988', '2026-09-02');
    snapshot.job = {
      status: 'running',
      startedAt: '2026-09-04T01:35:00.000Z',
      updatedAt: '2026-09-04T01:42:00.000Z',
    };

    expect(planWatchdogActions(
      [snapshot],
      new Date('2026-09-04T01:43:00.000Z'),
    )).toEqual([]);
  });

  it('lets the scheduled Fantasy5 crawler finish its ten-minute wait before recovering the same stale draw', () => {
    const snapshot = healthy('天天樂', '12003', '2026-09-18');
    snapshot.job = {
      status: 'waiting_source',
      startedAt: '2026-09-19T01:20:00.000Z',
      updatedAt: '2026-09-19T01:35:40.000Z',
    };

    expect(planWatchdogActions([snapshot], new Date('2026-09-19T01:43:00.000Z'))).toEqual([]);
    expect(planWatchdogActions([snapshot], new Date('2026-09-19T01:53:00.000Z'))).toEqual([{
      lottery: '天天樂', target: 'railway', reasons: ['crawler-stale'],
    }]);
  });

  it.each([
    ['just before the retry interval ends', '2026-09-19T01:33:00.001Z', []],
    ['at the retry interval boundary', '2026-09-19T01:33:00.000Z', ['crawler-stale']],
    ['missing completion time', null, ['crawler-stale']],
    ['invalid completion time', 'not-a-date', ['crawler-stale']],
    ['future completion time', '2026-09-19T01:44:00.000Z', ['crawler-stale']],
  ])('bounds Fantasy5 waiting-source protection for %s', (_label, updatedAt, reasons) => {
    const snapshot = healthy('天天樂', '12003', '2026-09-18');
    snapshot.job = { status: 'waiting_source', startedAt: '2026-09-19T01:42:00.000Z', updatedAt };
    expect(planWatchdogActions([snapshot], new Date('2026-09-19T01:43:00.000Z'))).toEqual(
      reasons.length ? [{ lottery: '天天樂', target: 'railway', reasons }] : [],
    );
  });

  it('does not bypass the pending Fantasy5 acquisition to recover an old period analysis', () => {
    const snapshot = healthy('天天樂', '12003', '2026-09-18');
    snapshot.job = { status: 'waiting_source', startedAt: null, updatedAt: '2026-09-19T01:40:00.000Z' };
    snapshot.latestAnalysis = null;
    expect(planWatchdogActions([snapshot], new Date('2026-09-19T01:43:00.000Z'))).toEqual([]);
  });

  it('still recovers a genuine Fantasy5 crawler failure with a fresh timestamp', () => {
    const snapshot = healthy('天天樂', '12003', '2026-09-18');
    snapshot.job = { status: 'failed', startedAt: null, updatedAt: '2026-09-19T01:42:00.000Z' };
    expect(planWatchdogActions([snapshot], new Date('2026-09-19T01:43:00.000Z'))).toEqual([{
      lottery: '天天樂', target: 'railway', reasons: ['job-failed', 'crawler-stale'],
    }]);
  });

  it('still recovers missing current-period analysis after Fantasy5 acquisition is complete', () => {
    const snapshot = healthy('天天樂', '12004', '2026-09-19');
    snapshot.job = { status: 'waiting_source', startedAt: null, updatedAt: '2026-09-19T01:42:00.000Z' };
    snapshot.latestAnalysis = null;
    expect(planWatchdogActions([snapshot], new Date('2026-09-19T01:43:00.000Z'))).toEqual([{
      lottery: '天天樂', target: 'railway', reasons: ['analysis-missing'],
    }]);
  });

  it('does not defer another lottery merely because its source is waiting', () => {
    const snapshot = healthy('今彩539', '115000227', '2026-09-18');
    snapshot.job = { status: 'waiting_source', startedAt: null, updatedAt: '2026-09-19T12:42:00.000Z' };
    expect(planWatchdogActions([snapshot], new Date('2026-09-19T12:43:00.000Z'))).toEqual([{
      lottery: '今彩539', target: 'railway', reasons: ['crawler-stale'],
    }]);
  });

  it('recovers Fantasy5 analysis on Railway without asking GitHub to run algorithms', () => {
    const snapshot = healthy('天天樂', '11989', '2026-09-04');
    snapshot.latestAnalysis = null;
    expect(planWatchdogActions(
      [snapshot],
      new Date('2026-09-04T01:43:00.000Z'),
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

  it('uses the 大樂透 20:53 call time before scheduling recovery', () => {
    expect(planWatchdogActions([
      healthy('大樂透', '115000214', '2026-09-03'),
    ], new Date('2026-09-04T13:03:00.000Z'))).toEqual([{
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
      healthy('天天樂', '11989', '2026-09-04'),
    ], new Date('2026-09-04T01:43:00.000Z'))).toEqual([]);
  });

  it('deduplicates crawler and analysis failures into one Railway recovery', () => {
    const snapshot = healthy('今彩539', '115000214', '2026-09-03');
    snapshot.job = { status: 'failed', startedAt: null, updatedAt: null };
    snapshot.latestAnalysis = null;
    expect(planWatchdogActions(
      [snapshot],
      new Date('2026-09-04T12:43:00.000Z'),
    )).toEqual([{
      lottery: '今彩539',
      target: 'railway',
      reasons: ['job-failed', 'crawler-stale', 'analysis-missing'],
    }]);
  });
  it('does not replay an old failed job after the expected draw is present', () => {
    const snapshot = healthy('今彩539', '115000215', '2026-09-04');
    snapshot.job = { status: 'failed', startedAt: null, updatedAt: null };
    expect(planWatchdogActions([snapshot], new Date('2026-09-04T12:43:00.000Z'))).toEqual([]);
  });

  it('uses the analysis heartbeat and live lease instead of immutable start time', () => {
    const snapshot = healthy('天天樂', '11989', '2026-09-04');
    snapshot.latestAnalysis = {
      drawPeriod: '11989',
      status: 'running',
      startedAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T01:40:00.000Z',
      leaseExpiresAt: '2026-09-04T02:05:00.000Z',
    };
    expect(planWatchdogActions([snapshot], new Date('2026-09-04T01:43:00.000Z'))).toEqual([]);
  });

  it('recovers running analysis only after heartbeat and lease both expire', () => {
    const snapshot = healthy('天天樂', '11989', '2026-09-04');
    snapshot.latestAnalysis = {
      drawPeriod: '11989',
      status: 'running',
      startedAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:30:00.000Z',
      leaseExpiresAt: '2026-09-04T01:00:00.000Z',
    };
    expect(planWatchdogActions(
      [snapshot],
      new Date('2026-09-04T01:43:00.000Z'),
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
      target: 'railway',
      reasons: ['crawler-stale'],
    }]);
    expect(planWatchdogActions([
      healthy('天天樂', '11989', '2026-03-07'),
    ], new Date('2026-03-09T01:43:00.000Z'))).toEqual([{
      lottery: '天天樂',
      target: 'railway',
      reasons: ['crawler-stale'],
    }]);
  });

  it('uses the post-fall-DST Fantasy5 call time without overlapping an older cycle', () => {
    expect(planWatchdogActions([
      healthy('天天樂', '12044', '2026-10-31'),
    ], new Date('2026-11-02T02:43:00.000Z'))).toEqual([{
      lottery: '天天樂',
      target: 'railway',
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
        target: 'railway',
        reasons: ['crawler-stale'],
      }]);
    }
  });

  it('opens the new fixed09:30 Fantasy5 cycle across spring DST', () => {
    const primary = new Date('2026-03-09T01:33:00.000Z');
    expect(expectedDrawDateForDueWindow('天天樂', primary)).toBe('2026-03-09');
    expect(planWatchdogActions([
      healthy('天天樂', '11989', '2026-03-07'),
    ], primary)).toHaveLength(1);
  });

});

describe('independent Matrix watchdog execution', () => {
  it('routes stale Fantasy5 recovery to Railway and leaves the lease for the recovery process', async () => {
    const releaseLease = vi.fn(async () => undefined);
    const recoverRailway = vi.fn(async () => ({ status: 'accepted' }));
    const dispatchFantasy5 = vi.fn(async () => 'dispatched');
    const watchdog = createIndependentWatchdog({
      loadSnapshot: async () => [healthy('天天樂', '11990', '2026-09-05')],
      claimLease: async () => true,
      releaseLease,
      recoverRailway,
      dispatchFantasy5,
    });

    await expect(watchdog.run(
      new Date('2026-09-06T01:43:00.000Z'),
      'invocation-fantasy5',
    )).resolves.toMatchObject({
      status: 'degraded',
      actions: [{
        lottery: '天天樂',
        target: 'railway',
        outcome: 'accepted',
      }],
    });
    expect(recoverRailway).toHaveBeenCalledWith('天天樂', 'invocation-fantasy5', {stage:'crawler',drawPeriod:null,minimumDrawDate:'2026-09-06'});
    expect(dispatchFantasy5).not.toHaveBeenCalled();
    expect(releaseLease).not.toHaveBeenCalled();
  });

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
        ...healthy('天天樂', '11989', '2026-09-04'),
        latestAnalysis: null,
      }],
      claimLease: async () => true,
      releaseLease: async () => undefined,
      recoverRailway,
      dispatchFantasy5,
    });

    await expect(watchdog.run(
      new Date('2026-09-04T01:43:00.000Z'),
      'invocation-1',
    )).resolves.toMatchObject({
      status: 'degraded',
      actions: [{
        lottery: '天天樂',
        target: 'railway',
        outcome: 'accepted',
      }],
    });
    expect(recoverRailway).toHaveBeenCalledWith('天天樂', 'invocation-1', {stage:'analysis',drawPeriod:'11989'});
    expect(dispatchFantasy5).not.toHaveBeenCalled();
  });
  it('does not execute an action while another host owns its lease', async () => {
    const recoverRailway = vi.fn(async () => ({ status: 'accepted' }));
    const snapshot = healthy('天天樂', '11989', '2026-09-04');
    snapshot.latestAnalysis = null;
    const watchdog = createIndependentWatchdog({
      loadSnapshot: async () => [snapshot],
      claimLease: async () => false,
      releaseLease: async () => undefined,
      recoverRailway,
      dispatchFantasy5: vi.fn(async () => 'dispatched'),
    });
    await expect(watchdog.run(
      new Date('2026-09-04T01:43:00.000Z'),
      'invocation-2',
    )).resolves.toMatchObject({
      status: 'degraded',
      actions: [{ outcome: 'lease-held' }],
    });
    expect(recoverRailway).not.toHaveBeenCalled();
  });

  it('retains an acquired lease when Railway acceptance is ambiguous', async () => {
    const releaseLease = vi.fn(async () => undefined);
    const snapshot = healthy('天天樂', '11989', '2026-09-04');
    snapshot.latestAnalysis = null;
    const watchdog = createIndependentWatchdog({
      loadSnapshot: async () => [snapshot],
      claimLease: async () => true,
      releaseLease,
      recoverRailway: vi.fn(async () => { throw new Error('offline'); }),
      dispatchFantasy5: vi.fn(async () => 'dispatched'),
    });
    await expect(watchdog.run(
      new Date('2026-09-04T01:43:00.000Z'),
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

it('optimizer observation mode never claims leases or starts recovery', async () => {
 const claimLease=vi.fn();const recoverRailway=vi.fn();
 const watchdog=createIndependentWatchdog({loadSnapshot:async()=>[{lottery:'天天樂',job:null,latestDraw:null,latestAnalysis:null}],claimLease,releaseLease:vi.fn(),recoverRailway,dispatchFantasy5:vi.fn()});
 const result=await watchdog.run(new Date('2026-09-06T01:43:00Z'),'observer',{recover:false});
 expect(result.actions).toEqual([]);expect(claimLease).not.toHaveBeenCalled();expect(recoverRailway).not.toHaveBeenCalled();
});
