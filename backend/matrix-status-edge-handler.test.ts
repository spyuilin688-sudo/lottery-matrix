import { describe, expect, it, vi } from 'vitest';
import { testMatrixEntitlements } from './test-matrix-entitlements';

import type { MemberContext } from './matrix-entitlements';
import { createMatrixStatusEdgeHandler } from '../supabase/functions/matrix-status/handler';

const lottery = '今彩539' as const;
type MatrixLottery = '今彩539' | '天天樂' | '六合彩' | '大樂透';
const drawPeriod = '115000210';
const analysisVersion = 'v1';

const explore = {
  lottery,
  drawPeriod,
  items: [2, 7, 13].map((explorePeriods, index) => ({
    id: `road-${explorePeriods}`,
    number: '01',
    lockedPosition: 1,
    predictionDistance: index + 1,
    consecutive: '準5進6',
    highestStreak: 5,
    predictionNumbers: ['06'],
    algorithmType: '加減',
    numberOrder: '依號碼由小到大排序',
    explorePeriods,
    exploreDateOffset: 0,
    ruleCount: 1,
    lockedSourceIndex: 0,
    lockedSourcePeriod: drawPeriod,
  })),
  validationById: {},
};

const tianyan = { lottery, drawPeriod, items: [], validationById: {} };

function dependencies(member?: MemberContext) {
  return {
    requireMember: vi.fn(async () => member ?? {
      authUserId: 'user-1',
      memberId: 'member-1',
      plan: 'monthly',
      active: true,
      referralSuccessCount: 0,
    }),
    resolveEntitlements: vi.fn(async () => testMatrixEntitlements(member ?? { authUserId: '', memberId: '', plan: 'free', active: false, referralSuccessCount: 0, loginPerksEligible: false }, new Date('2026-08-29T00:00:00Z'))),
    readStatusSources: vi.fn(async (requestedLottery: MatrixLottery = lottery) => ({
      analysisVersion,
      drawPeriod,
      explore: { ...explore, lottery: requestedLottery },
      tianyan: { ...tianyan, lottery: requestedLottery },
    })),
    readStatusValidation: vi.fn(async (_lottery, _period, _version, itemId) => ({
      itemId,
      validation: { itemId, ruleSets: [] },
    })),
    now: () => new Date('2026-08-29T00:00:00Z'),
  };
}

describe('Matrix status Edge Function', () => {
  it('returns only public details while preserving locked seven/thirteen predictions', async () => {
    const deps = dependencies();
    const handler = createMatrixStatusEdgeHandler(deps);
    const response = await handler(new Request('https://example.test/functions/v1/matrix-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lottery }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(deps.requireMember).not.toHaveBeenCalled();
    expect(deps.resolveEntitlements).toHaveBeenCalledTimes(1);
    expect(deps.readStatusSources).toHaveBeenCalledTimes(1);
    expect(body.detailLocked).toBe(true);
    const roads = body.cards.flatMap((card: { roads: Array<Record<string, unknown>> }) => card.roads);
    expect(roads).toEqual(expect.arrayContaining([
      expect.objectContaining({ explorePeriods: 2, locked: false }),
      expect.objectContaining({ explorePeriods: 7, locked: true, result: ['06'] }),
      expect.objectContaining({ explorePeriods: 13, locked: true, result: ['06'] }),
    ]));
    expect(roads.filter((road: Record<string, unknown>) => road.locked === true).map((road: Record<string, unknown>) => Object.keys(road).sort())).toEqual([
      ['explorePeriods', 'id', 'locked', 'result'],
      ['explorePeriods', 'id', 'locked', 'result'],
    ]);
  });

  it('returns summary-only data for all four homepage statuses from one batch request', async () => {
    const lotteries = ['今彩539', '天天樂', '六合彩', '大樂透'] as const;
    const deps = dependencies();
    const handler = createMatrixStatusEdgeHandler(deps);
    const response = await handler(new Request('https://example.test/functions/v1/matrix-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'summary-batch', lotteries }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.kind).toBe('status-summary-batch');
    expect(body.items.map((item: { lottery: MatrixLottery }) => item.lottery)).toEqual(lotteries);
    expect(body.items.every((item: { status: number }) => item.status === 200)).toBe(true);
    for (const item of body.items) {
      expect(item.body.kind).toBe('status-summary');
      expect(item.body.summary).toBeTruthy();
      expect(item.body).not.toHaveProperty('cards');
      expect(item.body).not.toHaveProperty('counts');
      expect(item.body).not.toHaveProperty('customTriggers');
      expect(JSON.stringify(item.body)).not.toContain('roads');
    }
    expect(deps.readStatusSources).toHaveBeenCalledTimes(4);
    expect(deps.requireMember).not.toHaveBeenCalled();
  });

  it('accepts a valid homepage summary subset without widening full batch requests', async () => {
    const deps = dependencies();
    const handler = createMatrixStatusEdgeHandler(deps);
    const subset = ['天天樂'] as const;
    const summaryResponse = await handler(new Request('https://example.test/functions/v1/matrix-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'summary-batch', lotteries: subset }),
    }));

    expect(summaryResponse.status).toBe(200);
    await expect(summaryResponse.json()).resolves.toMatchObject({
      kind: 'status-summary-batch',
      items: [{ lottery: '天天樂', status: 200 }],
    });
    expect(deps.readStatusSources).toHaveBeenCalledTimes(1);

    const fullBatchResponse = await handler(new Request('https://example.test/functions/v1/matrix-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'batch', lotteries: subset }),
    }));
    expect(fullBatchResponse.status).toBe(400);
  });

  it('reads standard compact summaries for authenticated members', async () => {
    const lotteries = ['今彩539', '天天樂', '六合彩', '大樂透'] as const;
    const deps = dependencies();
    const readCompactStatus = vi.fn(async (requestedLottery: MatrixLottery) => ({
      analysisVersion,
      drawPeriod,
      payload: {
        lottery: requestedLottery,
        drawPeriod,
        summary: {
          status: requestedLottery === '六合彩' || requestedLottery === '大樂透'
            ? 'RESONANCE'
            : 'ACTIVE',
          count: 2,
          message: 'summary-ready',
        },
        cards: 'homepage summary must not project cards',
      },
    }));
    const handler = createMatrixStatusEdgeHandler({
      ...deps,
      readCompactStatus,
    });

    const response = await handler(new Request('https://example.test/functions/v1/matrix-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer member-token',
      },
      body: JSON.stringify({ action: 'summary-batch', lotteries }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.every((item: { status: number }) => item.status === 200)).toBe(true);
    expect(body.items.find((item: { lottery: MatrixLottery }) => item.lottery === '六合彩')?.body)
      .toMatchObject({ kind: 'status-summary', summary: { status: 'RESONANCE' } });
    expect(body.items.find((item: { lottery: MatrixLottery }) => item.lottery === '大樂透')?.body)
      .toMatchObject({ kind: 'status-summary', summary: { status: 'RESONANCE' } });
    expect(readCompactStatus).toHaveBeenCalledTimes(4);
    expect(deps.requireMember).not.toHaveBeenCalled();
    expect(deps.resolveEntitlements).not.toHaveBeenCalled();
    expect(readCompactStatus).toHaveBeenCalledWith('今彩539', undefined, true);
    expect(deps.readStatusSources).not.toHaveBeenCalled();

    // The shared authentication must be request-local, including token changes.
    await handler(new Request('https://example.test/functions/v1/matrix-status', {
      method: 'POST',
      headers: { Authorization: 'Bearer another-member' },
      body: JSON.stringify({ action: 'summary-batch', lotteries }),
    }));
    expect(deps.requireMember).not.toHaveBeenCalled();
    expect(deps.resolveEntitlements).not.toHaveBeenCalled();
  });

  it('shares only completed public summaries until the database revision changes', async () => {
    const lotteries = ['今彩539', '天天樂', '六合彩', '大樂透'] as const;
    const deps = dependencies();
    let version = 1;
    let count = 1;
    const readCompactStatus = vi.fn(async (requestedLottery: MatrixLottery) => ({
      analysisVersion, drawPeriod,
      payload: { lottery: requestedLottery, drawPeriod, summary: { status: 'ACTIVE', count, message: '' } },
    }));
    const readRevision = vi.fn(async () => Object.fromEntries(lotteries.map((item) => [item, {
      drawRevision: 'draw-v1', generation: version, activeVersions: {},
    }])));
    const handler = createMatrixStatusEdgeHandler({ ...deps, readCompactStatus }, readRevision);
    const request = (action: string) => new Request('https://example.test/functions/v1/matrix-status', {
      method: 'POST', body: JSON.stringify({ action, lotteries }),
    });
    const first = await (await handler(request('summary-batch'))).json();
    const second = await (await handler(request('summary-batch'))).json();
    expect(first).toEqual(second);
    expect(readCompactStatus).toHaveBeenCalledTimes(4);
    expect(readRevision).toHaveBeenCalledTimes(3); // Check before and after the first load, then once on the hit.

    version = 2; // Same-period result correction.
    count = 2;
    const corrected = await (await handler(request('summary-batch'))).json();
    expect(corrected.items[0].body.summary.count).toBe(2);
    expect(readCompactStatus).toHaveBeenCalledTimes(8);

    await handler(request('batch'));
    expect(readCompactStatus).toHaveBeenCalledTimes(12);
    expect(deps.resolveEntitlements).toHaveBeenCalledTimes(4);
  });

  it('falls back to direct summary reads when the version probe is unavailable', async () => {
    const lotteries = ['今彩539'] as const;
    const deps = dependencies();
    const readCompactStatus = vi.fn(async () => ({
      analysisVersion, drawPeriod,
      payload: { lottery, drawPeriod, summary: { status: 'ACTIVE', count: 1, message: '' } },
    }));
    const handler = createMatrixStatusEdgeHandler({ ...deps, readCompactStatus },
      async () => { throw new Error('revision unavailable'); });
    const request = () => new Request('https://example.test/functions/v1/matrix-status', {
      method: 'POST', body: JSON.stringify({ action: 'summary-batch', lotteries }),
    });
    expect((await (await handler(request())).json()).items[0].status).toBe(200);
    expect((await (await handler(request())).json()).items[0].status).toBe(200);
    expect(readCompactStatus).toHaveBeenCalledTimes(2);
  });

  it('does not save an old summary when the version changes during loading', async () => {
    const lotteries = ['今彩539', '天天樂', '六合彩', '大樂透'] as const;
    const deps = dependencies();
    let generation = 1;
    const readCompactStatus = vi.fn(async (requestedLottery: MatrixLottery) => {
      if (requestedLottery === '今彩539' && generation === 1) generation = 2;
      return {
        analysisVersion, drawPeriod,
        payload: { lottery: requestedLottery, drawPeriod,
          summary: { status: 'ACTIVE', count: generation, message: '' } },
      };
    });
    const readRevision = async () => Object.fromEntries(lotteries.map((item) => [item, {
      drawRevision: 'same-period', generation, activeVersions: {},
    }]));
    const handler = createMatrixStatusEdgeHandler({ ...deps, readCompactStatus }, readRevision);
    const request = () => new Request('https://example.test/functions/v1/matrix-status', {
      method: 'POST', body: JSON.stringify({ action: 'summary-batch', lotteries }),
    });
    const first = await (await handler(request())).json();
    expect(first.items.every((item: { body: { summary: { count: number } } }) => item.body.summary.count === 2)).toBe(true);
    const readsAfterFirst = readCompactStatus.mock.calls.length;
    expect(readsAfterFirst).toBeGreaterThan(4);
    expect((await (await handler(request())).json()).items).toEqual(first.items);
    expect(readCompactStatus).toHaveBeenCalledTimes(readsAfterFirst);
  });

  it('does not reuse a not-ready summary as a completed result', async () => {
    const deps = dependencies();
    const readCompactStatus = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ analysisVersion, drawPeriod,
        payload: { lottery, drawPeriod, summary: { status: 'ACTIVE', count: 1, message: '' } } });
    const revisions = async () => Object.fromEntries(['今彩539', '天天樂', '六合彩', '大樂透'].map((item) => [item, {
      drawRevision: 'stable', generation: 1, activeVersions: {},
    }]));
    const handler = createMatrixStatusEdgeHandler({ ...deps, readCompactStatus }, revisions);
    const request = () => new Request('https://example.test/functions/v1/matrix-status', {
      method: 'POST', body: JSON.stringify({ action: 'summary-batch', lotteries: [lottery] }),
    });
    expect((await (await handler(request())).json()).items[0].status).toBe(404);
    expect((await (await handler(request())).json()).items[0].status).toBe(200);
    expect(readCompactStatus).toHaveBeenCalledTimes(2);
  });

  it('rejects unsupported methods without reading analysis data', async () => {
    const deps = dependencies();
    const handler = createMatrixStatusEdgeHandler(deps);
    const response = await handler(new Request('https://example.test/functions/v1/matrix-status'));

    expect(response.status).toBe(405);
    expect(deps.readStatusSources).not.toHaveBeenCalled();
  });

  it('routes validation requests through the same protected Edge Function', async () => {
    const deps = dependencies();
    const handler = createMatrixStatusEdgeHandler(deps);
    const response = await handler(new Request('https://example.test/functions/v1/matrix-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'validation', lottery, drawPeriod, analysisVersion, itemId: 'road-2',
      }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: 'status-validation', itemId: 'road-2', validation: { itemId: 'road-2' },
    });
    expect(deps.readStatusValidation).toHaveBeenCalledWith(
      lottery, drawPeriod, analysisVersion, 'road-2',
    );
  });
});


it('rechecks current entitlements through lightweight identity without reading result payloads', async () => {
  const deps = dependencies();
  const readStatusIdentity = vi.fn(async () => ({ drawPeriod, analysisVersion }));
  const handler = createMatrixStatusEdgeHandler({ ...deps, readStatusIdentity });
  const read = async () => {
    const response = await handler(new Request('https://example.test/functions/v1/matrix-status', {
      method: 'POST', headers: { Authorization: 'Bearer same-member' },
      body: JSON.stringify({ action: 'identity', lottery }),
    }));
    return response.json();
  };
  deps.resolveEntitlements.mockResolvedValue(testMatrixEntitlements({ authUserId: 'user-1', memberId: 'member-1', plan: 'monthly', active: true, referralSuccessCount: 0 }, new Date('2026-08-29T00:00:00Z')));
  expect(await read()).toMatchObject({ kind: 'status-identity', entitlements: { canUseThirteen: true } });
  deps.requireMember.mockResolvedValue({ authUserId: 'user-1', memberId: 'member-1', plan: 'free', active: false, referralSuccessCount: 0 });
  deps.resolveEntitlements.mockResolvedValue(testMatrixEntitlements({ authUserId: 'user-1', memberId: 'member-1', plan: 'free', active: false, referralSuccessCount: 0 }, new Date('2026-08-29T00:00:00Z')));
  expect(await read()).toMatchObject({ kind: 'status-identity', entitlements: { canUseThirteen: false } });
  expect(deps.requireMember).not.toHaveBeenCalled();
  expect(deps.resolveEntitlements).toHaveBeenCalledTimes(2);
  expect(deps.readStatusSources).not.toHaveBeenCalled();
  expect(readStatusIdentity).toHaveBeenCalledTimes(2);
});
