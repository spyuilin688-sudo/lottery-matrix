import { describe, expect, it } from 'vitest';
import { createMatrixStatusRoutes } from './matrix-status-routes';
import type { MemberContext } from './matrix-entitlements';
import type { ExploreArtifact } from './matrix-explore-service';

const artifact: ExploreArtifact = {
  lottery: '今彩539', drawPeriod: '114000123', validationById: {}, items: [{
    id: 'road', number: '05', lockedPosition: 1, predictionDistance: 1,
    consecutive: '準7進8', highestStreak: 7, predictionNumbers: ['08'], algorithmType: '加減',
    numberOrder: '依號碼由小到大排序', explorePeriods: 13, exploreDateOffset: 0, ruleCount: 1,
  }, {
    id: 'road-2', number: '05', lockedPosition: 1, predictionDistance: 1,
    consecutive: '準7進8', highestStreak: 7, predictionNumbers: ['08'], algorithmType: '加減',
    numberOrder: '依號碼由小到大排序', explorePeriods: 2, exploreDateOffset: 0, ruleCount: 1,
  }, {
    id: 'road-7', number: '05', lockedPosition: 1, predictionDistance: 1,
    consecutive: '準7進8', highestStreak: 7, predictionNumbers: ['08'], algorithmType: '加減',
    numberOrder: '依號碼由小到大排序', explorePeriods: 7, exploreDateOffset: 0, ruleCount: 1,
  }],
};

function member(plan: MemberContext['plan'], active = plan !== 'free'): MemberContext {
  return { authUserId: 'user', memberId: 'member', plan, active, referralSuccessCount: 0 };
}

function routes(context: MemberContext, now = new Date('2026-08-21T00:00:00Z')) {
  return createMatrixStatusRoutes({
    requireMember: async () => context,
    readAnalysis: async (kind) => kind === 'explore'
      ? { analysisVersion: 'v1', drawPeriod: artifact.drawPeriod, data: artifact }
      : { analysisVersion: 'v1', drawPeriod: artifact.drawPeriod, data: { lottery: '今彩539', drawPeriod: artifact.drawPeriod, items: [], validationById: {} } },
    listConfigs: async () => [],
    now: () => now,
  });
}

describe('Matrix status route', () => {
  it('returns live Chapter 15 status from the completed Explore artifact', async () => {
    await expect(routes(member('monthly')).get({ authorization: 'Bearer token', body: { lottery: '今彩539' } })).resolves.toMatchObject({
      status: 200,
      body: { kind: 'status', lottery: '今彩539', drawPeriod: '114000123', analysisVersion: 'v1:status', summary: { status: 'RESONANCE', count: 1 } },
    });
  });

  it('shows anonymous two- and seven-period road details on Friday without member auth', async () => {
    let authCalls = 0;
    const api = createMatrixStatusRoutes({
      requireMember: async () => { authCalls += 1; throw new Error('should not authenticate'); },
      readAnalysis: async (kind) => kind === 'explore'
        ? { analysisVersion: 'v1', drawPeriod: artifact.drawPeriod, data: artifact }
        : { analysisVersion: 'v1', drawPeriod: artifact.drawPeriod, data: { lottery: '今彩539', drawPeriod: artifact.drawPeriod, items: [], validationById: {} } },
      listConfigs: async () => [],
      now: () => new Date('2026-08-21T00:00:00Z'),
    });
    const response = await api.get({ authorization: undefined, body: { lottery: '今彩539' } });
    expect(response).toMatchObject({ status: 200, body: { detailLocked: true } });
    expect((response.body.cards as Array<{ roads: Array<{ explorePeriods: number }> }>)[0]?.roads.map((road) => road.explorePeriods)).toEqual([2, 7]);
    expect(authCalls).toBe(0);
  });

  it('shows only anonymous two-period road details outside Tuesday and Friday', async () => {
    const response = await routes(member('free', false), new Date('2026-08-24T00:00:00Z')).get({ authorization: undefined, body: { lottery: '今彩539' } });
    expect((response.body.cards as Array<{ roads: Array<{ explorePeriods: number }> }>)[0]?.roads.map((road) => road.explorePeriods)).toEqual([2]);
  });

  it('shows thirteen-period road details to Matrix Pro without changing the summary', async () => {
    const response = await routes(member('monthly')).get({ authorization: 'Bearer token', body: { lottery: '今彩539' } });
    expect(response).toMatchObject({ status: 200, body: { summary: { status: 'RESONANCE', count: 1 }, detailLocked: false } });
    expect((response.body.cards as Array<{ roads: Array<{ explorePeriods: number }> }>)[0]?.roads.map((road) => road.explorePeriods)).toContain(13);
  });

  it('returns analysis-not-ready instead of sample data', async () => {
    const api = createMatrixStatusRoutes({ requireMember: async () => member('monthly'), readAnalysis: async () => null, listConfigs: async () => [] });
    await expect(api.get({ authorization: 'Bearer token', body: { lottery: '今彩539' } })).resolves.toMatchObject({ status: 404, body: { error: { code: 'ANALYSIS_NOT_READY' } } });
  });

  it('does not expose a partial version when Tianyan is missing or mismatched', async () => {
    const base = { requireMember: async () => member('monthly'), listConfigs: async () => [] };
    const missing = createMatrixStatusRoutes({ ...base, readAnalysis: async (kind) => kind === 'explore' ? { analysisVersion: 'v1', drawPeriod: artifact.drawPeriod, data: artifact } : null });
    await expect(missing.get({ authorization: 'Bearer token', body: { lottery: '今彩539' } })).resolves.toMatchObject({ status: 404, body: { error: { code: 'ANALYSIS_NOT_READY' } } });
    const mismatched = createMatrixStatusRoutes({ ...base, readAnalysis: async (kind) => kind === 'explore'
      ? { analysisVersion: 'v1', drawPeriod: artifact.drawPeriod, data: artifact }
      : { analysisVersion: 'v2', drawPeriod: artifact.drawPeriod, data: { lottery: '今彩539', drawPeriod: artifact.drawPeriod, items: [], validationById: {} } } });
    await expect(mismatched.get({ authorization: 'Bearer token', body: { lottery: '今彩539' } })).resolves.toMatchObject({ status: 404, body: { error: { code: 'ANALYSIS_NOT_READY' } } });
  });
});
