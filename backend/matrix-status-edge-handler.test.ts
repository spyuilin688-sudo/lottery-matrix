import { describe, expect, it, vi } from 'vitest';

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
    expect(deps.requireMember).toHaveBeenCalledTimes(1);
    expect(readCompactStatus).toHaveBeenCalledWith('今彩539', undefined, true);
    expect(deps.readStatusSources).not.toHaveBeenCalled();

    // The shared authentication must be request-local, including token changes.
    await handler(new Request('https://example.test/functions/v1/matrix-status', {
      method: 'POST',
      headers: { Authorization: 'Bearer another-member' },
      body: JSON.stringify({ action: 'summary-batch', lotteries }),
    }));
    expect(deps.requireMember).toHaveBeenCalledTimes(2);
    expect(deps.requireMember).toHaveBeenLastCalledWith('Bearer another-member');
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
  expect(await read()).toMatchObject({ kind: 'status-identity', entitlements: { canUseThirteen: true } });
  deps.requireMember.mockResolvedValue({ authUserId: 'user-1', memberId: 'member-1', plan: 'free', active: false, referralSuccessCount: 0 });
  expect(await read()).toMatchObject({ kind: 'status-identity', entitlements: { canUseThirteen: false } });
  expect(deps.requireMember).toHaveBeenCalledTimes(2);
  expect(deps.readStatusSources).not.toHaveBeenCalled();
  expect(readStatusIdentity).toHaveBeenCalledTimes(2);
});
