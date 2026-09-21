import { expect, it, vi } from 'vitest';
import type { MatrixLottery } from '../shared/matrix-status-presets';
import type { MemberContext } from './matrix-entitlements';
import { createMatrixStatusRoutes } from './matrix-status-routes';
import { testMatrixEntitlements } from './test-matrix-entitlements';

const drawPeriod = '114000123';
const lotteries: MatrixLottery[] = ['今彩539', '天天樂', '六合彩', '大樂透'];

function compactFor(lottery: MatrixLottery, cardId = 'two-code:08,09:ACTIVE-2') {
  return {
    analysisVersion: 'v1',
    drawPeriod,
    payload: {
      lottery,
      drawPeriod,
      summary: {
        lottery, drawPeriod, status: 'ACTIVE', count: 1,
        message: '具備基本參考價值',
      },
      counts: { ACTIVE: 1, FOCUS: 0, RESONANCE: 0, CRITICAL: 0 },
      cards: [{
        id: cardId, ruleId: 'ACTIVE-2', status: 'ACTIVE',
        hitType: 'two-code', result: ['08', '09'], sameCodeRoadCount: 2,
        roads: [{
          id: `${cardId}:road-2`, validationItemId: 'road-2', hitType: 'two-code',
          result: ['08', '09'], algorithmType: '加減', numberOrder: '依號碼由小到大排序',
          streak: 7, predictionDistance: 1, position: 1, lockedNumber: '05', explorePeriods: 2,
        }, {
          id: `${cardId}:road-13`, validationItemId: 'road-13', hitType: 'two-code',
          result: ['08', '09'], algorithmType: '合值', numberOrder: '依號碼由小到大排序',
          streak: 7, predictionDistance: 2, position: 2, lockedNumber: '06', explorePeriods: 13,
        }],
      }],
      artifactKinds: ['explore', 'tianyan'],
      artifactCounts: { explore: 2, tianyan: 0 },
      customTriggers: [{ status: 'ACTIVE', groupId: 'one' }],
      customSettings: [],
    },
  };
}

const compact = compactFor('今彩539');

function member(plan: MemberContext['plan'], memberId = 'member'): MemberContext {
  return {
    authUserId: `user-${memberId}`, memberId, plan,
    active: plan !== 'free', referralSuccessCount: 0,
  };
}

it('uses ordinary compact precomputed status for a member', async () => {
  let compactCalls = 0;
  let rawCalls = 0;
  const routes = createMatrixStatusRoutes({
    requireMember: async () => member('monthly'),
    resolveEntitlements: async () => testMatrixEntitlements(member('monthly')),
    readCompactStatus: async () => { compactCalls += 1; return compact; },
    readStatusSources: async () => { rawCalls += 1; throw new Error('raw source should not be read'); },
    now: () => new Date('2026-08-24T00:00:00Z'),
  });

  const response = await routes.get({ authorization: 'Bearer token', body: { lottery: '今彩539' } });

  expect(response).toMatchObject({
    status: 200,
    body: {
      kind: 'status', lottery: '今彩539', drawPeriod,
      analysisVersion: 'v1:status', sourceAnalysisVersion: 'v1',
      summary: { status: 'ACTIVE', count: 1 }, detailLocked: false,
    },
  });
  expect(compactCalls).toBe(1);
  expect(rawCalls).toBe(0);
});

it.each(lotteries)('uses ordinary precomputed status for %s', async (lottery) => {
  const readCompactStatus = vi.fn(async () => compactFor(lottery));
  const readStatusSources = vi.fn(async () => { throw new Error('raw sources must not be read'); });
  const routes = createMatrixStatusRoutes({
    requireMember: async () => member('monthly'),
    resolveEntitlements: async () => testMatrixEntitlements(member('monthly')), readCompactStatus, readStatusSources,
  });
  const response = await routes.get({ authorization: 'Bearer token', body: { lottery } });
  expect(response).toMatchObject({ status: 200, body: { lottery, drawPeriod,
    artifactKinds: ['explore', 'tianyan'], artifactCounts: { explore: 2, tianyan: 0 },
  } });
  expect(response.body).not.toHaveProperty('customSettings');
  expect(response.body).not.toHaveProperty('customTriggers');
  expect(readCompactStatus).toHaveBeenCalledWith(lottery, undefined);
  expect(readStatusSources).not.toHaveBeenCalled();
});
