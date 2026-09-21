import { describe, expect, it } from 'vitest';
import { createMatrixStatusRoutes } from './matrix-status-routes';
import type { MemberContext } from './matrix-entitlements';
import { testMatrixEntitlements } from './test-matrix-entitlements';

const drawPeriod = '114000123';

const freeMember: MemberContext = {
  authUserId: 'user',
  memberId: 'member',
  plan: 'free',
  active: false,
  referralSuccessCount: 0,
};

describe('Matrix status validation compact read path', () => {
  it('authorizes a visible default-status road from compact status without loading full status sources', async () => {
    let sourceReads = 0;
    let validationReads = 0;
    const api = createMatrixStatusRoutes({
      requireMember: async () => freeMember,
      resolveEntitlements: async () => testMatrixEntitlements(freeMember, new Date('2026-08-21T00:00:00Z')),

      readCompactStatus: async () => ({
        analysisVersion: 'v1',
        drawPeriod,
        payload: {
          lottery: '今彩539',
          drawPeriod,
          cards: [{
            sameCodeRoadCount: 1,
            roads: [{
              id: 'status-road-7',
              result: ['08'],
              explorePeriods: 7,
              streak: 7,
              predictionDistance: 1,
              position: 1,
              validationItemId: 'road-7',
            }],
          }],
        },
      }),
      readStatusSources: async () => {
        sourceReads += 1;
        throw new Error('full status sources must not be read for default validation');
      },
      readStatusValidation: async (_lottery, _period, _version, itemId) => {
        validationReads += 1;
        return { itemId, validation: { itemId, ruleSets: [] } };
      },
      now: () => new Date('2026-08-21T00:00:00Z'),
    });

    const response = await api.validation({
      authorization: 'Bearer token',
      body: {
        lottery: '今彩539',
        drawPeriod,
        analysisVersion: 'v1',
        itemId: 'road-7',
      },
    });

    expect(response).toEqual({
      status: 200,
      body: {
        kind: 'status-validation',
        lottery: '今彩539',
        drawPeriod,
        analysisVersion: 'v1',
        itemId: 'road-7',
        validation: { itemId: 'road-7', ruleSets: [] },
        cacheIdentity: {
          drawPeriod,
          analysisVersion: 'v1',
          entitlements: {
            canUseFullRange: false, canUseSeven: true, canUseThirteen: false,
            canUseTiangong: false, canUseTianyan: false, canViewFullStatus: false,
          },
        },
      },
    });
    expect(sourceReads).toBe(0);
    expect(validationReads).toBe(1);
  });
});
