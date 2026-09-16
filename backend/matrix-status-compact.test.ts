import { expect, it } from 'vitest';
import { createDefaultCustomStatusConfig } from './matrix-custom-status';
import type { MemberContext } from './matrix-entitlements';
import { createMatrixStatusRoutes } from './matrix-status-routes';

const drawPeriod = '114000123';
const compact = {
  analysisVersion: 'v1',
  drawPeriod,
  payload: {
    lottery: '今彩539',
    drawPeriod,
    summary: {
      lottery: '今彩539', drawPeriod, status: 'ACTIVE', count: 1,
      message: '具備基本參考價值',
    },
    counts: { ACTIVE: 1, FOCUS: 0, RESONANCE: 0, CRITICAL: 0 },
    cards: [{
      id: 'two-code:08,09:ACTIVE-2', ruleId: 'ACTIVE-2', status: 'ACTIVE',
      hitType: 'two-code', result: ['08', '09'], sameCodeRoadCount: 2,
      roads: [{
        id: 'road-2', validationItemId: 'road-2', hitType: 'two-code',
        result: ['08', '09'], algorithmType: '加減', numberOrder: '依號碼由小到大排序',
        streak: 7, predictionDistance: 1, position: 1, lockedNumber: '05', explorePeriods: 2,
      }, {
        id: 'road-13', validationItemId: 'road-13', hitType: 'two-code',
        result: ['08', '09'], algorithmType: '合值', numberOrder: '依號碼由小到大排序',
        streak: 7, predictionDistance: 2, position: 2, lockedNumber: '06', explorePeriods: 13,
      }],
    }],
    artifactKinds: ['explore', 'tianyan'],
    artifactCounts: { explore: 2, tianyan: 0 },
  },
};

const raw = {
  analysisVersion: 'v1',
  drawPeriod,
  explore: {
    lottery: '今彩539', drawPeriod, items: [{
      id: 'raw-road', number: '05', lockedPosition: 1, predictionDistance: 1,
      consecutive: '準7進8', highestStreak: 7, predictionNumbers: ['08'],
      algorithmType: '加減', numberOrder: '依號碼由小到大排序',
      explorePeriods: 13, exploreDateOffset: 0, ruleCount: 1, lockedSourceIndex: 7,
    }],
  },
  tianyan: { lottery: '今彩539', drawPeriod, items: [] },
};

function member(plan: MemberContext['plan']): MemberContext {
  return {
    authUserId: 'user', memberId: 'member', plan,
    active: plan !== 'free', referralSuccessCount: 0,
  };
}

it('uses compact precomputed status when the member has no custom status config', async () => {
  let compactCalls = 0;
  let rawCalls = 0;
  const routes = createMatrixStatusRoutes({
    requireMember: async () => member('monthly'),
    readCompactStatus: async () => { compactCalls += 1; return compact; },
    readStatusSources: async () => { rawCalls += 1; throw new Error('raw source should not be read'); },
    listConfigs: async () => [],
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

it('keeps raw source evaluation for member-specific custom status config', async () => {
  let compactCalls = 0;
  let rawCalls = 0;
  const config = createDefaultCustomStatusConfig('今彩539', 'ACTIVE');
  const routes = createMatrixStatusRoutes({
    requireMember: async () => member('monthly'),
    readCompactStatus: async () => { compactCalls += 1; return compact; },
    readStatusSources: async () => { rawCalls += 1; return raw; },
    listConfigs: async () => [config],
    now: () => new Date('2026-08-24T00:00:00Z'),
  });

  const response = await routes.get({ authorization: 'Bearer token', body: { lottery: '今彩539' } });

  expect(response.status).toBe(200);
  expect(rawCalls).toBe(1);
  expect(compactCalls).toBe(0);
});
