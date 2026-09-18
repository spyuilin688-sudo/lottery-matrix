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

const customConfig = {
  lottery,
  status: 'ACTIVE' as const,
  explorePeriods: 13 as const,
  exploreRange: '完整範圍' as const,
  oneCodeGroups: [{
    id: 'one',
    rows: [{
      consecutive: '準4進5',
      roadType: '加減' as const,
      numberOrder: '依號碼由小到大排序' as const,
      sameCodeQuantity: 2,
    }],
  }],
  twoCodeGroups: [],
};

function dependencies(member?: MemberContext) {
  const customStatusStore = {
    list: vi.fn(async () => []),
    save: vi.fn(async (_memberId: string, value: unknown) => value),
    reset: vi.fn(async () => undefined),
  };
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
    listConfigs: vi.fn(async () => []),
    customStatusStore,
    recomputeMember: vi.fn(async (memberId: string, requestedLottery: MatrixLottery) => ({
      memberId,
      lottery: requestedLottery,
      updated: true,
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

  it('falls back to standard compact summaries when custom status cache is missing', async () => {
    const lotteries = ['今彩539', '天天樂', '六合彩', '大樂透'] as const;
    const deps = dependencies();
    deps.listConfigs.mockResolvedValue([
      { ...customConfig, lottery: '六合彩' },
      { ...customConfig, lottery: '大樂透' },
    ]);
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
    const readStatusIdentity = vi.fn(async () => ({ analysisVersion, drawPeriod }));
    const readCustomStatus = vi.fn(async () => null);
    const handler = createMatrixStatusEdgeHandler({
      ...deps,
      readCompactStatus,
      readStatusIdentity,
      readCustomStatus,
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
    expect(readCustomStatus).toHaveBeenCalledTimes(2);
    expect(readCompactStatus).toHaveBeenCalledTimes(4);
    expect(deps.readStatusSources).not.toHaveBeenCalled();
  });

  it('fails closed before writing when custom recompute is not configured', async () => {
    const deps = dependencies();
    const { recomputeMember: _missing, ...withoutRecompute } = deps;
    const handler = createMatrixStatusEdgeHandler(withoutRecompute);
    const response = await handler(new Request('https://example.test/functions/v1/matrix-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer member-token',
      },
      body: JSON.stringify({ action: 'custom-save', config: customConfig }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'CUSTOM_STATUS_WRITE_NOT_CONFIGURED' },
    });
    expect(deps.customStatusStore.save).not.toHaveBeenCalled();
  });

  it('saves a custom status setting through the member route and recomputes before success', async () => {
    const deps = dependencies();
    const handler = createMatrixStatusEdgeHandler(deps);
    const response = await handler(new Request('https://example.test/functions/v1/matrix-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer member-token',
      },
      body: JSON.stringify({ action: 'custom-save', config: customConfig }),
    }));

    expect(response.status).toBe(200);
    expect(deps.customStatusStore.save).toHaveBeenCalledWith(
      'member-1',
      expect.objectContaining({ lottery, status: 'ACTIVE', schemaVersion: 2 }),
    );
    expect(deps.recomputeMember).toHaveBeenCalledWith('member-1', lottery);
    expect(deps.customStatusStore.save.mock.invocationCallOrder[0])
      .toBeLessThan(deps.recomputeMember.mock.invocationCallOrder[0]);
  });

  it('resets a custom status setting through the member route and recomputes before success', async () => {
    const deps = dependencies();
    const handler = createMatrixStatusEdgeHandler(deps);
    const response = await handler(new Request('https://example.test/functions/v1/matrix-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer member-token',
      },
      body: JSON.stringify({ action: 'custom-reset', lottery, status: 'ACTIVE' }),
    }));

    expect(response.status).toBe(200);
    expect(deps.customStatusStore.reset).toHaveBeenCalledWith('member-1', lottery, 'ACTIVE');
    expect(deps.recomputeMember).toHaveBeenCalledWith('member-1', lottery);
    expect(deps.customStatusStore.reset.mock.invocationCallOrder[0])
      .toBeLessThan(deps.recomputeMember.mock.invocationCallOrder[0]);
  });

  it('uses the authenticated member custom status configuration', async () => {
    const deps = dependencies();
    deps.listConfigs.mockResolvedValue([{
      lottery,
      status: 'FOCUS',
      explorePeriods: 13,
      exploreRange: '完整範圍',
      oneCodeGroups: [{
        id: 'focus-group',
        rows: [{
          consecutive: '準5進6',
          roadType: '加減',
          numberOrder: '依號碼由小到大排序',
          sameCodeQuantity: 3,
        }],
      }],
      twoCodeGroups: [],
    }]);
    const handler = createMatrixStatusEdgeHandler(deps);
    const response = await handler(new Request('https://example.test/functions/v1/matrix-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer member-token',
      },
      body: JSON.stringify({ lottery }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(deps.requireMember).toHaveBeenCalledWith('Bearer member-token');
    expect(body.detailLocked).toBe(false);
    expect(body.customTriggers).toContainEqual({ status: 'FOCUS', groupId: 'focus-group' });
    expect(body.cards).toContainEqual(expect.objectContaining({ id: 'custom:FOCUS:focus-group:06' }));
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
