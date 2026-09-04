import { describe, expect, it } from 'vitest';
import { createMatrixStatusRoutes } from './matrix-status-routes';
import type { MemberContext } from './matrix-entitlements';
import type { ExploreArtifact } from './matrix-explore-service';

const artifact: ExploreArtifact = {
  lottery: '今彩539', drawPeriod: '114000123', validationById: {}, items: [{
    id: 'road', number: '05', lockedPosition: 1, predictionDistance: 1,
    consecutive: '準7進8', highestStreak: 7, predictionNumbers: ['08'], algorithmType: '加減',
    numberOrder: '依號碼由小到大排序', explorePeriods: 13, exploreDateOffset: 0, ruleCount: 1,
    lockedSourceIndex: 7,
  }, {
    id: 'road-2', number: '05', lockedPosition: 1, predictionDistance: 1,
    consecutive: '準7進8', highestStreak: 7, predictionNumbers: ['08'], algorithmType: '加減',
    numberOrder: '依號碼由小到大排序', explorePeriods: 2, exploreDateOffset: 0, ruleCount: 1,
    lockedSourceIndex: 0,
  }, {
    id: 'road-7', number: '05', lockedPosition: 1, predictionDistance: 1,
    consecutive: '準7進8', highestStreak: 7, predictionNumbers: ['08'], algorithmType: '加減',
    numberOrder: '依號碼由小到大排序', explorePeriods: 7, exploreDateOffset: 0, ruleCount: 1,
    lockedSourceIndex: 2,
  }],
};

function member(plan: MemberContext['plan'], active = plan !== 'free'): MemberContext {
  return { authUserId: 'user', memberId: 'member', plan, active, referralSuccessCount: 0 };
}

function routes(context: MemberContext, now = new Date('2026-08-21T00:00:00Z')) {
  return createMatrixStatusRoutes({
    requireMember: async () => context,
    readStatusSources: async () => ({
      analysisVersion: 'v1',
      drawPeriod: artifact.drawPeriod,
      explore: artifact,
      tianyan: { lottery: '今彩539', drawPeriod: artifact.drawPeriod, items: [], validationById: {} },
    }),
    listConfigs: async () => [],
    readStatusValidation: async (_lottery, _drawPeriod, _analysisVersion, itemId) => ({
      itemId,
      validation: { itemId, ruleSets: [] },
    }),
    now: () => now,
  });
}

describe('Matrix status route', () => {
  it('returns live Chapter 15 status from the completed Explore artifact', async () => {
    await expect(routes(member('monthly')).get({ authorization: 'Bearer token', body: { lottery: '今彩539' } })).resolves.toMatchObject({
      status: 200,
      body: {
        kind: 'status', lottery: '今彩539', drawPeriod: '114000123',
        analysisVersion: 'v1:status', sourceAnalysisVersion: 'v1',
        summary: { status: 'CRITICAL', count: 1 },
      },
    });
  });

  it('shows anonymous two- and seven-period road details on Friday without member auth', async () => {
    let authCalls = 0;
    const api = createMatrixStatusRoutes({
      requireMember: async () => { authCalls += 1; throw new Error('should not authenticate'); },
      readStatusSources: async () => ({
        analysisVersion: 'v1',
        drawPeriod: artifact.drawPeriod,
        explore: artifact,
        tianyan: { lottery: '今彩539', drawPeriod: artifact.drawPeriod, items: [], validationById: {} },
      }),
      listConfigs: async () => [],
      now: () => new Date('2026-08-21T00:00:00Z'),
    });
    const response = await api.get({ authorization: undefined, body: { lottery: '今彩539' } });
    expect(response).toMatchObject({ status: 200, body: { detailLocked: true } });
    const card = (response.body.cards as Array<{
      sameCodeRoadCount: number | null;
      sameCodeRoadCountLocked: boolean;
      roads: Array<Record<string, unknown>>;
    }>)[0];
    expect(card).toMatchObject({ sameCodeRoadCount: null, sameCodeRoadCountLocked: true });
    expect(card.roads).toHaveLength(3);
    expect(card.roads.filter((road) => road.locked === false).map((road) => road.explorePeriods)).toEqual([2, 7]);
    expect(card.roads.filter((road) => road.locked === true)).toEqual([
      expect.objectContaining({ result: ['08'], locked: true }),
    ]);
    expect(card.roads.find((road) => road.locked === true)).not.toHaveProperty('algorithmType');
    expect(authCalls).toBe(0);
  });

  it('shows only anonymous two-period road details outside Tuesday and Friday', async () => {
    const response = await routes(member('free', false), new Date('2026-08-24T00:00:00Z')).get({ authorization: undefined, body: { lottery: '今彩539' } });
    const roads = (response.body.cards as Array<{ roads: Array<Record<string, unknown>> }>)[0]?.roads ?? [];
    expect(roads.filter((road) => road.locked === false).map((road) => road.explorePeriods)).toEqual([2]);
    expect(roads.filter((road) => road.locked === true)).toHaveLength(1);
  });

  it('opens seven-period details for a free member whose referral access is active', async () => {
    const referred = { ...member('free', false), referralSuccessCount: 15 };
    const response = await routes(referred, new Date('2026-08-19T00:00:00Z')).get({
      authorization: 'Bearer token',
      body: { lottery: '今彩539' },
    });
    const roads = (response.body.cards as Array<{ roads: Array<Record<string, unknown>> }>)[0]?.roads ?? [];
    expect(roads.filter((road) => road.locked === false).map((road) => road.explorePeriods).sort()).toEqual([2, 7]);
    expect(roads.filter((road) => road.locked === true)).toHaveLength(1);
  });

  it('shows thirteen-period road details to Matrix Pro without changing the summary', async () => {
    const response = await routes(member('monthly')).get({ authorization: 'Bearer token', body: { lottery: '今彩539' } });
    expect(response).toMatchObject({ status: 200, body: { summary: { status: 'CRITICAL', count: 1 }, detailLocked: false } });
    const card = (response.body.cards as Array<{
      sameCodeRoadCount: number;
      sameCodeRoadCountLocked: boolean;
      roads: Array<Record<string, unknown>>;
    }>)[0];
    expect(card).toMatchObject({ sameCodeRoadCount: 3, sameCodeRoadCountLocked: false });
    expect(card.roads.map((road) => road.explorePeriods).sort((left, right) => Number(left) - Number(right))).toEqual([2, 7, 13]);
    expect(card.roads.every((road) => road.locked === false && typeof road.validationItemId === 'string')).toBe(true);
  });

  it('returns validation only when the requested status road is visible to the caller', async () => {
    const response = await routes(member('free', false)).validation({
      body: {
        lottery: '今彩539', drawPeriod: artifact.drawPeriod,
        analysisVersion: 'v1', itemId: 'road-7',
      },
    });

    expect(response).toEqual({
      status: 200,
      body: {
        kind: 'status-validation', lottery: '今彩539', drawPeriod: artifact.drawPeriod,
        analysisVersion: 'v1', itemId: 'road-7',
        validation: { itemId: 'road-7', ruleSets: [] },
      },
    });
  });

  it('does not disclose validation for a locked or guessed status road', async () => {
    const api = routes(member('free', false), new Date('2026-08-24T00:00:00Z'));
    await expect(api.validation({
      body: {
        lottery: '今彩539', drawPeriod: artifact.drawPeriod,
        analysisVersion: 'v1', itemId: 'road-7',
      },
    })).resolves.toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN' } } });
    await expect(api.validation({
      body: {
        lottery: '今彩539', drawPeriod: artifact.drawPeriod,
        analysisVersion: 'v1', itemId: 'guessed-road',
      },
    })).resolves.toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN' } } });
  });

  it('rejects stale status validation versions before reading validation data', async () => {
    await expect(routes(member('monthly')).validation({
      authorization: 'Bearer token',
      body: {
        lottery: '今彩539', drawPeriod: artifact.drawPeriod,
        analysisVersion: 'stale', itemId: 'road',
      },
    })).resolves.toMatchObject({
      status: 409,
      body: { error: { code: 'ANALYSIS_VERSION_MISMATCH' } },
    });
  });

  it('returns analysis-not-ready instead of sample data', async () => {
    const api = createMatrixStatusRoutes({ requireMember: async () => member('monthly'), readStatusSources: async () => null, listConfigs: async () => [] });
    await expect(api.get({ authorization: 'Bearer token', body: { lottery: '今彩539' } })).resolves.toMatchObject({ status: 404, body: { error: { code: 'ANALYSIS_NOT_READY' } } });
  });

  it('does not expose a partial source when Tianyan is missing or mismatched', async () => {
    const base = { requireMember: async () => member('monthly'), listConfigs: async () => [] };
    const missing = createMatrixStatusRoutes({ ...base, readStatusSources: async () => ({
      analysisVersion: 'v1', drawPeriod: artifact.drawPeriod, explore: artifact, tianyan: null,
    }) });
    await expect(missing.get({ authorization: 'Bearer token', body: { lottery: '今彩539' } })).resolves.toMatchObject({ status: 404, body: { error: { code: 'ANALYSIS_NOT_READY' } } });
    const mismatched = createMatrixStatusRoutes({ ...base, readStatusSources: async () => ({
      analysisVersion: 'v1',
      drawPeriod: artifact.drawPeriod,
      explore: artifact,
      tianyan: { lottery: '今彩539', drawPeriod: 'different-period', items: [], validationById: {} },
    }) });
    await expect(mismatched.get({ authorization: 'Bearer token', body: { lottery: '今彩539' } })).resolves.toMatchObject({ status: 404, body: { error: { code: 'ANALYSIS_NOT_READY' } } });
  });
});
