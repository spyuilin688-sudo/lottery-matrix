import { expect, it, vi } from 'vitest';
import { createDefaultCustomStatusConfig } from './matrix-custom-status';
import { matrixCustomStatusConfigKey } from './matrix-custom-status-result';
import type { MemberContext } from './matrix-entitlements';
import { createMatrixStatusRoutes } from './matrix-status-routes';

const lottery = '今彩539' as const;
const drawPeriod = '114000123';
const config = createDefaultCustomStatusConfig(lottery, 'ACTIVE');

function member(plan: MemberContext['plan'], active = true): MemberContext {
  return {
    authUserId: 'user-1', memberId: 'member-1', plan, active,
    referralSuccessCount: 0,
  };
}

function payload(cardId: string) {
  return {
    lottery,
    drawPeriod,
    summary: { lottery, drawPeriod, status: 'ACTIVE', count: 1, message: 'ok' },
    counts: { ACTIVE: 1, FOCUS: 0, RESONANCE: 0, CRITICAL: 0 },
    cards: [{
      id: cardId, ruleId: 'CUSTOM:ACTIVE:one', status: 'ACTIVE',
      hitType: 'one-code', result: ['08'], sameCodeRoadCount: 1,
      roads: [{
        id: `${cardId}:road`, validationItemId: 'road', hitType: 'one-code',
        result: ['08'], algorithmType: '加減', numberOrder: '依號碼由小到大排序',
        streak: 4, predictionDistance: 1, position: 1, lockedNumber: '05', explorePeriods: 13,
      }],
    }],
    customTriggers: [{ status: 'ACTIVE', groupId: 'one' }],
    customSettings: [],
  };
}

function cached(overrides: Partial<{
  analysisVersion: string;
  drawPeriod: string;
  configKey: string;
}> = {}) {
  return {
    analysisVersion: overrides.analysisVersion ?? 'v1',
    drawPeriod: overrides.drawPeriod ?? drawPeriod,
    configKey: overrides.configKey ?? matrixCustomStatusConfigKey([config], lottery),
    standardPayload: payload('standard'),
    compositePayload: payload('composite'),
  };
}

it('rejects the previous draw cache as soon as a new status identity is current', async () => {
  const readStatusSources = vi.fn(async () => { throw new Error('raw source must not be read'); });
  const readCustomStatus = vi.fn(async () => cached());
  const routes = createMatrixStatusRoutes({
    requireMember: async () => member('monthly'),
    readStatusIdentity: async () => ({ analysisVersion: 'v2', drawPeriod: '114000124' }),
    readCustomStatus,
    readStatusSources,
    listConfigs: async () => [config],
  });

  await expect(routes.get({ authorization: 'Bearer token', body: { lottery } })).resolves.toEqual({
    status: 404,
    body: { error: { code: 'ANALYSIS_NOT_READY' } },
  });
  expect(readCustomStatus).toHaveBeenCalledWith('member-1', lottery, '114000124');
  expect(readStatusSources).not.toHaveBeenCalled();
});

it('rejects a cache from an older analysis version of the same draw', async () => {
  const readStatusSources = vi.fn(async () => { throw new Error('raw source must not be read'); });
  const routes = createMatrixStatusRoutes({
    requireMember: async () => member('monthly'),
    readStatusIdentity: async () => ({ analysisVersion: 'v2', drawPeriod }),
    readCustomStatus: async () => cached({ analysisVersion: 'v1' }),
    readStatusSources,
    listConfigs: async () => [config],
  });

  await expect(routes.get({ authorization: 'Bearer token', body: { lottery } })).resolves.toMatchObject({
    status: 404,
  });
  expect(readStatusSources).not.toHaveBeenCalled();
});

it('rejects a cache generated from an older custom config without live recomputation', async () => {
  const readStatusSources = vi.fn(async () => { throw new Error('raw source must not be read'); });
  const routes = createMatrixStatusRoutes({
    requireMember: async () => member('monthly'),
    readStatusIdentity: async () => ({ analysisVersion: 'v1', drawPeriod }),
    readCustomStatus: async () => cached({ configKey: 'stale-config' }),
    readStatusSources,
    listConfigs: async () => [config],
  });

  await expect(routes.get({ authorization: 'Bearer token', body: { lottery } })).resolves.toMatchObject({
    status: 404,
  });
  expect(readStatusSources).not.toHaveBeenCalled();
});

it('projects the current plan at GET time instead of baking plan access into the cache', async () => {
  const readStatusSources = vi.fn(async () => { throw new Error('raw source must not be read'); });
  const makeRoutes = (plan: MemberContext['plan']) => createMatrixStatusRoutes({
    requireMember: async () => member(plan),
    readStatusIdentity: async () => ({ analysisVersion: 'v1', drawPeriod }),
    readCustomStatus: async () => cached(),
    readStatusSources,
    listConfigs: async () => [config],
  });

  const monthly = await makeRoutes('monthly').get({ authorization: 'Bearer token', body: { lottery } });
  const quarterly = await makeRoutes('quarterly').get({ authorization: 'Bearer token', body: { lottery } });

  expect((monthly.body.cards as Array<{ id: string }>)[0]?.id).toBe('standard');
  expect((quarterly.body.cards as Array<{ id: string }>)[0]?.id).toBe('composite');
  expect(readStatusSources).not.toHaveBeenCalled();
});

it('uses the shared compact result when stored custom settings are not currently entitled', async () => {
  const readCustomStatus = vi.fn(async () => cached());
  const readStatusIdentity = vi.fn(async () => ({ analysisVersion: 'v1', drawPeriod }));
  const readStatusSources = vi.fn(async () => { throw new Error('raw source must not be read'); });
  const routes = createMatrixStatusRoutes({
    requireMember: async () => member('free', false),
    readStatusIdentity,
    readCustomStatus,
    readCompactStatus: async () => ({
      analysisVersion: 'v1', drawPeriod, payload: payload('shared'),
    }),
    readStatusSources,
    listConfigs: async () => [config],
  });

  const response = await routes.get({ authorization: 'Bearer token', body: { lottery } });

  expect(response).toMatchObject({ status: 200, body: { cards: [{ id: 'shared' }] } });
  expect(readCustomStatus).not.toHaveBeenCalled();
  expect(readStatusIdentity).not.toHaveBeenCalled();
  expect(readStatusSources).not.toHaveBeenCalled();
});
