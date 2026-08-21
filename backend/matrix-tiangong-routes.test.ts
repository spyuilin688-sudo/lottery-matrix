import { describe, expect, it } from 'vitest';
import type { MatrixPlan, MemberContext } from './matrix-entitlements';
import { MatrixAccessError } from './matrix-member-auth';
import { createMatrixTiangongRoutes } from './matrix-tiangong-routes';
import type { TiangongArtifact } from './matrix-tiangong-service';

const artifact: TiangongArtifact = {
  lottery: '今彩539', drawPeriod: '114000123',
  items: [{
    id: 'tg-1', sourceSequence: [1, 3, 5], eligiblePeriodRange: 50,
    interval: 2, predictionDistance: 1, predictedPosition: 1, predictionNumber: '15', roadType: '加減版路',
    ruleIdentity: 'rule-1', mode: 'one-stage', hitCondition: '準2進3', exploreDirection: '固定',
    firstStageDirection: '固定', firstRoadType: '加減',
  }],
  validationById: { 'tg-1': { itemId: 'tg-1', ruleIdentity: 'rule-1', validationRows: [] } },
};

function member(plan: MatrixPlan): MemberContext {
  return { authUserId: 'auth', memberId: 'member', plan, active: plan !== 'free', referralSuccessCount: 0 };
}

function routes(plan: MatrixPlan = 'yearly', ready = true) {
  return createMatrixTiangongRoutes({
    requireMember: async () => member(plan),
    readAnalysis: async () => ready ? {
      analysisVersion: '114000123:v1', drawPeriod: '114000123', data: artifact,
    } : null,
  });
}

const body = {
  lottery: '今彩539', periodRange: 50, mode: 'one-stage', hitCondition: '準2進3',
  exploreDirections: ['固定'], firstStageDirections: ['固定'], firstRoadTypes: ['加減'],
};

describe('Matrix Tiangong routes', () => {
  it('requires login', async () => {
    const api = createMatrixTiangongRoutes({
      requireMember: async () => { throw new MatrixAccessError('AUTH_REQUIRED', 401); },
      readAnalysis: async () => null,
    });
    await expect(api.list({ body })).resolves.toMatchObject({ status: 401, body: { error: { code: 'AUTH_REQUIRED' } } });
  });

  it.each(['free', 'monthly', 'quarterly'] as MatrixPlan[])('rejects %s members', async (plan) => {
    await expect(routes(plan).list({ authorization: 'Bearer token', body })).resolves.toMatchObject({ status: 403 });
  });

  it.each(['yearly', 'lifetime'] as MatrixPlan[])('allows %s members', async (plan) => {
    await expect(routes(plan).list({ authorization: 'Bearer token', body })).resolves.toMatchObject({
      status: 200, body: { kind: 'tiangong', total: 1, items: [{
        sourceSequence: [1, 3, 5], predictionDistance: 1,
      }] },
    });
  });

  it('returns not ready before a complete artifact exists', async () => {
    await expect(routes('yearly', false).list({ authorization: 'Bearer token', body })).resolves.toMatchObject({
      status: 404, body: { error: { code: 'ANALYSIS_NOT_READY' } },
    });
  });

  it('rejects stale validation versions', async () => {
    await expect(routes().validation({ authorization: 'Bearer token', body: {
      lottery: '今彩539', drawPeriod: '114000123', analysisVersion: 'old', itemId: 'tg-1',
    } })).resolves.toMatchObject({ status: 409, body: { error: { code: 'ANALYSIS_VERSION_MISMATCH' } } });
  });
});
