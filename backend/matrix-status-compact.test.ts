import { expect, it, vi } from 'vitest';
import { createDefaultCustomStatusConfig, type MatrixLottery } from './matrix-custom-status';
import { matrixCustomStatusConfigKey } from './matrix-custom-status-result';
import type { MemberContext } from './matrix-entitlements';
import { createMatrixStatusRoutes } from './matrix-status-routes';

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

const raw = {
  analysisVersion: 'v1',
  drawPeriod,
  explore: {
    lottery: '今彩539' as const, drawPeriod, items: [{
      id: 'raw-road', number: '05', lockedPosition: 1, predictionDistance: 1,
      consecutive: '準7進8' as const, highestStreak: 7, predictionNumbers: ['08'],
      algorithmType: '加減' as const, numberOrder: '依號碼由小到大排序' as const,
      explorePeriods: 13 as const, exploreDateOffset: 0, ruleCount: 1, lockedSourceIndex: 7,
    }],
  },
  tianyan: { lottery: '今彩539' as const, drawPeriod, items: [] },
};

function member(plan: MemberContext['plan'], memberId = 'member'): MemberContext {
  return {
    authUserId: `user-${memberId}`, memberId, plan,
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

it('reads a member-specific precomputed result instead of raw sources for custom status', async () => {
  const config = createDefaultCustomStatusConfig('今彩539', 'ACTIVE');
  const readCustomStatus = vi.fn(async () => ({
    ...compact,
    configKey: matrixCustomStatusConfigKey([config], '今彩539'),
    standardPayload: compact.payload,
    compositePayload: compact.payload,
  }));
  const readStatusSources = vi.fn(async () => raw);
  const readCompactStatus = vi.fn(async () => compact);
  const routes = createMatrixStatusRoutes({
    requireMember: async () => member('monthly'),
    readCompactStatus,
    readCustomStatus,
    readStatusSources,
    listConfigs: async () => [config],
    now: () => new Date('2026-08-24T00:00:00Z'),
  });

  const response = await routes.get({ authorization: 'Bearer token', body: { lottery: '今彩539' } });

  expect(response).toMatchObject({ status: 200, body: { lottery: '今彩539', drawPeriod } });
  expect(readCustomStatus).toHaveBeenCalledTimes(1);
  expect(readStatusSources).not.toHaveBeenCalled();
  expect(readCompactStatus).not.toHaveBeenCalled();
});

it('never recomputes unchanged custom status during repeated homepage GETs', async () => {
  const config = createDefaultCustomStatusConfig('今彩539', 'ACTIVE');
  const readCustomStatus = vi.fn(async () => ({
    ...compact,
    configKey: matrixCustomStatusConfigKey([config], '今彩539'),
    standardPayload: compact.payload,
    compositePayload: compact.payload,
  }));
  const readStatusSources = vi.fn(async () => { throw new Error('raw recompute is forbidden on GET'); });
  const routes = createMatrixStatusRoutes({
    requireMember: async () => member('monthly'),
    readCompactStatus: async () => compact,
    readCustomStatus,
    readStatusSources,
    listConfigs: async () => [config],
    now: () => new Date('2026-08-24T00:00:00Z'),
  });

  await expect(routes.get({ authorization: 'Bearer token', body: { lottery: '今彩539' } })).resolves.toMatchObject({ status: 200 });
  await expect(routes.get({ authorization: 'Bearer token', body: { lottery: '今彩539' } })).resolves.toMatchObject({ status: 200 });

  expect(readCustomStatus).toHaveBeenCalledTimes(2);
  expect(readStatusSources).not.toHaveBeenCalled();
});

it.each(lotteries)('uses the precomputed member result for %s custom status', async (lottery) => {
  const config = createDefaultCustomStatusConfig(lottery, 'ACTIVE');
  const cached = compactFor(lottery, `custom:${lottery}`);
  const readCustomStatus = vi.fn(async () => ({
    ...cached,
    configKey: matrixCustomStatusConfigKey([config], lottery),
    standardPayload: cached.payload,
    compositePayload: cached.payload,
  }));
  const readStatusSources = vi.fn(async () => { throw new Error('raw source should not be read'); });
  const routes = createMatrixStatusRoutes({
    requireMember: async () => member('monthly'),
    readCompactStatus: async () => compactFor(lottery),
    readCustomStatus,
    readStatusSources,
    listConfigs: async () => [config],
    now: () => new Date('2026-08-24T00:00:00Z'),
  });

  await expect(routes.get({ authorization: 'Bearer token', body: { lottery } })).resolves.toMatchObject({
    status: 200,
    body: { lottery, drawPeriod },
  });
  expect(readCustomStatus).toHaveBeenCalledTimes(1);
  expect(readStatusSources).not.toHaveBeenCalled();
});

it('keeps precomputed custom results isolated by member id', async () => {
  const config = createDefaultCustomStatusConfig('今彩539', 'ACTIVE');
  const readCustomStatus = vi.fn(async (memberId: string) => {
    const cached = compactFor('今彩539', `custom:${memberId}`);
    return {
      ...cached,
      configKey: matrixCustomStatusConfigKey([config], '今彩539'),
      standardPayload: cached.payload,
      compositePayload: cached.payload,
    };
  });
  const makeRoutes = (memberId: string) => createMatrixStatusRoutes({
    requireMember: async () => member('monthly', memberId),
    readCompactStatus: async () => compact,
    readCustomStatus,
    readStatusSources: async () => { throw new Error('raw source should not be read'); },
    listConfigs: async () => [config],
    now: () => new Date('2026-08-24T00:00:00Z'),
  });

  const first = await makeRoutes('member-a').get({ authorization: 'Bearer a', body: { lottery: '今彩539' } });
  const second = await makeRoutes('member-b').get({ authorization: 'Bearer b', body: { lottery: '今彩539' } });

  expect((first.body.cards as Array<{ id: string }>)[0]?.id).toBe('custom:member-a');
  expect((second.body.cards as Array<{ id: string }>)[0]?.id).toBe('custom:member-b');
  expect(readCustomStatus.mock.calls.map((call) => call[0])).toEqual(['member-a', 'member-b']);
});
