import { describe, expect, it, vi } from 'vitest';

import type { MemberContext } from './matrix-entitlements';
import { createMatrixStatusEdgeHandler } from '../supabase/functions/matrix-status/handler';

const lottery = '今彩539' as const;
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
    consecutive: '準4進5',
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
    readStatusSources: vi.fn(async () => ({
      analysisVersion,
      drawPeriod,
      explore,
      tianyan,
    })),
    listConfigs: vi.fn(async () => []),
    now: () => new Date('2026-08-29T00:00:00Z'),
  };
}

describe('Matrix status Edge Function', () => {
  it('returns only public 2-period roads to an anonymous caller', async () => {
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
    expect(body.cards.flatMap((card: { roads: Array<{ explorePeriods: number }> }) => card.roads))
      .toEqual(expect.arrayContaining([expect.objectContaining({ explorePeriods: 2 })]));
    expect(body.cards.flatMap((card: { roads: Array<{ explorePeriods: number }> }) => card.roads))
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ explorePeriods: 13 })]));
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
          consecutive: '準4進5',
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
    expect(body.cards).toContainEqual(expect.objectContaining({ id: 'custom:FOCUS:focus-group' }));
  });

  it('rejects unsupported methods without reading analysis data', async () => {
    const deps = dependencies();
    const handler = createMatrixStatusEdgeHandler(deps);
    const response = await handler(new Request('https://example.test/functions/v1/matrix-status'));

    expect(response.status).toBe(405);
    expect(deps.readStatusSources).not.toHaveBeenCalled();
  });
});
