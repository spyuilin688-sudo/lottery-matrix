import { describe, expect, it } from 'vitest';
import { createMatrixStatusRoutes } from './matrix-status-routes';
import type { MemberContext } from './matrix-entitlements';
import type { ExploreArtifact } from './matrix-explore-service';

const artifact: ExploreArtifact = {
  lottery: '今彩539', drawPeriod: '114000123', validationById: {}, items: [{
    id: 'road', number: '05', lockedPosition: 1, predictionDistance: 1,
    consecutive: '準7進8', highestStreak: 7, predictionNumbers: ['08'], algorithmType: '加減',
    numberOrder: '依號碼由小到大排序', explorePeriods: 13, exploreDateOffset: 0, ruleCount: 1,
  }],
};

function member(plan: MemberContext['plan'], active = plan !== 'free'): MemberContext {
  return { authUserId: 'user', memberId: 'member', plan, active, referralSuccessCount: 0 };
}

function routes(context: MemberContext) {
  return createMatrixStatusRoutes({
    requireMember: async () => context,
    readAnalysis: async (kind) => kind === 'explore'
      ? { analysisVersion: 'v1', drawPeriod: artifact.drawPeriod, data: artifact }
      : { analysisVersion: 'v1', drawPeriod: artifact.drawPeriod, data: { lottery: '今彩539', drawPeriod: artifact.drawPeriod, items: [], validationById: {} } },
    listConfigs: async () => [],
    now: () => new Date('2026-08-21T00:00:00Z'),
  });
}

describe('Matrix status route', () => {
  it('returns live Chapter 15 status from the completed Explore artifact', async () => {
    await expect(routes(member('monthly')).get({ authorization: 'Bearer token', body: { lottery: '今彩539' } })).resolves.toMatchObject({
      status: 200,
      body: { kind: 'status', lottery: '今彩539', drawPeriod: '114000123', analysisVersion: 'v1:status', summary: { status: 'RESONANCE', count: 1 } },
    });
  });

  it('keeps free-member summary visible but locks detailed roads', async () => {
    const response = await routes(member('free', false)).get({ authorization: 'Bearer token', body: { lottery: '今彩539' } });
    expect(response).toMatchObject({ status: 200, body: { detailLocked: true, cards: [{ roads: [] }] } });
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
