import { describe, expect, it } from 'vitest';
import type { MatrixPlan, MemberContext } from './matrix-entitlements';
import { createMatrixTianyanRoutes } from './matrix-tianyan-routes';
import type { TianyanArtifact } from './matrix-tianyan-service';

const artifact: TianyanArtifact = {
  lottery: '今彩539',
  drawPeriod: '114000123',
  items: [{
    id: 't-1',
    number: '07',
    lockedPosition: 1,
    predictionDistance: 1,
    consecutive: '準9進10',
    highestStreak: 9,
    predictionNumbers: ['03', '15'],
    roadType: '複合',
    hitCondition: '準5+（鎖定2碼）',
    numberOrder: '依號碼由小到大排序',
    explorePeriods: 13,
    exploreDateOffset: 0,
    ruleIds: ['r1', 'r2'],
  }],
  validationById: {
    't-1': {
      itemId: 't-1',
      rules: [],
      groupCount: 9,
      minimumIndependentHits: 3,
      rule1Only: 3,
      rule2Only: 3,
      bothHit: 3,
      historicalValidation: [],
    },
  },
};

function member(plan: MatrixPlan): MemberContext {
  return { authUserId: 'auth-1', memberId: 'member-1', plan, active: plan !== 'free', referralSuccessCount: 0 };
}

function routes(plan: MatrixPlan = 'quarterly', ready = true) {
  return createMatrixTianyanRoutes({
    requireMember: async () => member(plan),
    readAnalysis: async () => ready ? {
      analysisVersion: '114000123:v1',
      drawPeriod: '114000123',
      data: artifact,
    } : null,
    now: () => new Date('2026-08-21T00:00:00Z'),
  });
}

const listBody = { lottery: '今彩539', selectedStreaks: ['準9進10'] };

describe('Matrix Tianyan routes', () => {
  it.each(['quarterly', 'yearly', 'lifetime'] as MatrixPlan[])('allows %s members', async (plan) => {
    await expect(routes(plan).list({ authorization: 'Bearer token', body: listBody })).resolves.toMatchObject({
      status: 200,
      body: { kind: 'tianyan', total: 1 },
    });
  });

  it.each(['free', 'trial', 'monthly'] as MatrixPlan[])('rejects %s members', async (plan) => {
    await expect(routes(plan).list({ authorization: 'Bearer token', body: listBody })).resolves.toMatchObject({
      status: 403,
      body: { error: { code: 'FORBIDDEN' } },
    });
  });

  it('returns ANALYSIS_NOT_READY until a complete artifact exists', async () => {
    await expect(routes('quarterly', false).list({ authorization: 'Bearer token', body: listBody })).resolves.toMatchObject({
      status: 404,
      body: { error: { code: 'ANALYSIS_NOT_READY' } },
    });
  });

  it('rejects detail from a different analysis version', async () => {
    await expect(routes().validation({ authorization: 'Bearer token', body: {
      lottery: '今彩539', drawPeriod: '114000123', analysisVersion: 'old', itemId: 't-1',
    } })).resolves.toMatchObject({
      status: 409,
      body: { error: { code: 'ANALYSIS_VERSION_MISMATCH' } },
    });
  });
});
