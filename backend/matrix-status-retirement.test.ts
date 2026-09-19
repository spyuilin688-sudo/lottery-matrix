import { expect, it, vi } from 'vitest';
import { createMatrixStatusEdgeHandler } from '../supabase/functions/matrix-status/handler';
import { createMatrixStatusRoutes } from './matrix-status-routes';

const lottery = '今彩539' as const;
const drawPeriod = '115000210';
const compact = {
  analysisVersion: 'v1', drawPeriod,
  payload: {
    lottery, drawPeriod, summary: { lottery, drawPeriod, status: 'ACTIVE', count: 1 },
    counts: { ACTIVE: 1, FOCUS: 0, RESONANCE: 0, CRITICAL: 0 },
    cards: [{ id: 'preset', ruleId: 'ACTIVE-1', status: 'ACTIVE', sameCodeRoadCount: 1,
      roads: [{ id: 'road', validationItemId: 'road', result: ['08'], explorePeriods: 2 }] }],
  },
};
function dependencies() {
  return {
    requireMember: vi.fn(async () => ({ authUserId: 'user', memberId: 'member', plan: 'monthly' as const, active: true, referralSuccessCount: 0 })),
    readCompactStatus: vi.fn(async () => compact),
    readStatusValidation: vi.fn(async () => ({ itemId: 'road', validation: { rows: [] } })),
    readStatusSources: vi.fn(async () => { throw new Error('raw source forbidden'); }),
    listConfigs: vi.fn(async () => { throw new Error('retired config access'); }),
    readCustomStatus: vi.fn(async () => { throw new Error('retired cache access'); }),
    customStatusStore: { list: vi.fn(), save: vi.fn(), reset: vi.fn() },
    recomputeMember: vi.fn(), recomputeLottery: vi.fn(), authorizeInternal: vi.fn(() => true),
  };
}
it.each(['custom-save', 'custom-reset', 'recompute'])('rejects retired %s before authentication, reads, writes, or recomputation', async (action) => {
  const deps = dependencies();
  const response = await createMatrixStatusEdgeHandler(deps)(new Request('https://example.test', {
    method: 'POST', headers: { authorization: 'Bearer token' }, body: JSON.stringify({ action, lottery }),
  }));
  expect(response.status).toBe(410);
  expect(await response.json()).toEqual({ error: { code: 'CUSTOM_STATUS_RETIRED' } });
  for (const value of Object.values(deps)) {
    if (typeof value === 'function') expect(value).not.toHaveBeenCalled();
  }
  for (const value of Object.values(deps.customStatusStore)) expect(value).not.toHaveBeenCalled();
});
it('serves authenticated get, summary, and validation from ordinary precomputed status without retired dependencies', async () => {
  const deps = dependencies();
  const routes = createMatrixStatusRoutes(deps);
  const input = { authorization: 'Bearer token', body: { lottery, drawPeriod, analysisVersion: 'v1', itemId: 'road' } };
  expect(await routes.get(input)).toMatchObject({ status: 200, body: { summary: { status: 'ACTIVE' } } });
  expect(await routes.summary(input)).toMatchObject({ status: 200, body: { summary: { status: 'ACTIVE' } } });
  expect(await routes.validation(input)).toMatchObject({ status: 200, body: { validation: { rows: [] } } });
  expect(deps.readCompactStatus).toHaveBeenCalledTimes(3);
  expect(deps.listConfigs).not.toHaveBeenCalled();
  expect(deps.readCustomStatus).not.toHaveBeenCalled();
  expect(deps.readStatusSources).not.toHaveBeenCalled();
});

it.each(['get', 'summary', 'validation'] as const)('returns not-ready from %s when ordinary precomputed status is unavailable', async (action) => {
  const deps = dependencies();
  const readCompactStatus = vi.fn(async () => null);
  const routes = createMatrixStatusRoutes({ ...deps, readCompactStatus });
  const response = await routes[action]({ authorization: 'Bearer token', body: {
    lottery, drawPeriod, analysisVersion: 'v1', itemId: 'road',
  } });
  expect(response).toEqual({ status: 404, body: { error: { code: 'ANALYSIS_NOT_READY' } } });
  expect(deps.readStatusSources).not.toHaveBeenCalled();
  expect(deps.readStatusValidation).not.toHaveBeenCalled();
  expect(deps.listConfigs).not.toHaveBeenCalled();
  expect(deps.readCustomStatus).not.toHaveBeenCalled();
});
