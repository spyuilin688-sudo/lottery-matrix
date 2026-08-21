import { describe, expect, it } from 'vitest';
import type { MemberContext } from './matrix-entitlements';
import { MatrixAccessError } from './matrix-member-auth';
import { createMatrixExploreRoutes } from './matrix-explore-routes';
import type { ExploreArtifact } from './matrix-explore-service';

const member: MemberContext = {
  authUserId: 'auth-1',
  memberId: 'member-1',
  plan: 'monthly',
  active: true,
  referralSuccessCount: 0,
};

const artifact: ExploreArtifact = {
  lottery: '今彩539',
  drawPeriod: '114000123',
  items: [{
    id: 'item-1',
    number: '10',
    lockedPosition: 1,
    predictionDistance: 1,
    consecutive: '準4進5',
    highestStreak: 4,
    predictionNumbers: ['03'],
    algorithmType: '加減',
    numberOrder: '依號碼由小到大排序',
    explorePeriods: 13,
    exploreDateOffset: 0,
    ruleCount: 1,
    referenceOffset: -14,
  }, {
    id: 'item-2', number: '10', lockedPosition: 1, predictionDistance: 1,
    consecutive: '準4進5', highestStreak: 4, predictionNumbers: ['03'], algorithmType: '加減',
    numberOrder: '依號碼由小到大排序', explorePeriods: 2, exploreDateOffset: 0, ruleCount: 1,
    referenceOffset: -7,
  }, {
    id: 'item-7', number: '10', lockedPosition: 1, predictionDistance: 1,
    consecutive: '準4進5', highestStreak: 4, predictionNumbers: ['03'], algorithmType: '加減',
    numberOrder: '依號碼由小到大排序', explorePeriods: 7, exploreDateOffset: 0, ruleCount: 1,
    referenceOffset: -7,
  }],
  validationById: {
    'item-1': { itemId: 'item-1', ruleSets: [] },
    'item-2': { itemId: 'item-2', ruleSets: [] },
    'item-7': { itemId: 'item-7', ruleSets: [] },
  },
};

const listBody = {
  lottery: '今彩539',
  numberOrder: '依號碼由小到大排序',
  explorePeriods: 13,
  exploreDateOffset: 0,
  exploreRange: '完整範圍',
  ruleCount: 1,
  roadTypes: ['加減'],
  selectedStreaks: ['準4進5'],
  sameCode: false,
};

function routes(overrides: Partial<Parameters<typeof createMatrixExploreRoutes>[0]> = {}) {
  return createMatrixExploreRoutes({
    requireMember: async () => member,
    readAnalysis: async () => ({
      analysisVersion: '114000123:v1',
      drawPeriod: '114000123',
      data: artifact,
    }),
    now: () => new Date('2026-08-21T00:00:00Z'),
    ...overrides,
  });
}

describe('Matrix Explore routes', () => {
  it('allows anonymous standard two-period exploration without calling member auth', async () => {
    let authCalls = 0;
    const api = routes({ requireMember: async () => { authCalls += 1; throw new MatrixAccessError('AUTH_REQUIRED', 401); } });
    const response = await api.list({ authorization: undefined, body: { ...listBody, explorePeriods: 2, exploreRange: '標準範圍' } });
    expect(response).toMatchObject({ status: 200, body: { total: 1, items: [{ id: 'item-2' }] } });
    expect(authCalls).toBe(0);
  });

  it('allows anonymous standard seven-period exploration on Friday', async () => {
    const api = routes({ requireMember: async () => { throw new MatrixAccessError('AUTH_REQUIRED', 401); } });
    await expect(api.list({ authorization: undefined, body: { ...listBody, explorePeriods: 7, exploreRange: '標準範圍' } })).resolves.toMatchObject({
      status: 200, body: { items: [{ id: 'item-7' }] },
    });
  });

  it('denies anonymous seven-period exploration outside Tuesday and Friday', async () => {
    const api = routes({
      requireMember: async () => { throw new MatrixAccessError('AUTH_REQUIRED', 401); },
      now: () => new Date('2026-08-24T00:00:00Z'),
    });
    await expect(api.list({ authorization: undefined, body: { ...listBody, explorePeriods: 7, exploreRange: '標準範圍' } })).resolves.toMatchObject({
      status: 403, body: { error: { code: 'FORBIDDEN' } },
    });
  });

  it('keeps anonymous thirteen-period exploration restricted', async () => {
    const api = routes({ requireMember: async () => { throw new MatrixAccessError('AUTH_REQUIRED', 401); } });
    await expect(api.list({ authorization: undefined, body: listBody })).resolves.toMatchObject({
      status: 403, body: { error: { code: 'FORBIDDEN' } },
    });
  });

  it('rejects an invalid bearer token instead of treating it as anonymous', async () => {
    const api = routes({ requireMember: async () => { throw new MatrixAccessError('AUTH_REQUIRED', 401); } });
    await expect(api.list({ authorization: 'Bearer invalid', body: { ...listBody, explorePeriods: 2, exploreRange: '標準範圍' } })).resolves.toMatchObject({
      status: 401, body: { error: { code: 'AUTH_REQUIRED' } },
    });
  });

  it('allows anonymous validation for a public two-period road', async () => {
    const api = routes({ requireMember: async () => { throw new MatrixAccessError('AUTH_REQUIRED', 401); } });
    await expect(api.validation({ authorization: undefined, body: {
      lottery: '今彩539', drawPeriod: '114000123', analysisVersion: '114000123:v1', itemId: 'item-2',
    } })).resolves.toMatchObject({ status: 200, body: { itemId: 'item-2' } });
  });

  it('returns 403 when thirteen/full access is unavailable', async () => {
    const api = routes({ requireMember: async () => ({ ...member, plan: 'free', active: false }) });
    await expect(api.list({ authorization: 'Bearer token', body: listBody })).resolves.toMatchObject({
      status: 403,
      body: { error: { code: 'FORBIDDEN' } },
    });
  });

  it('returns ANALYSIS_NOT_READY until a complete artifact exists', async () => {
    const api = routes({ readAnalysis: async () => null });
    await expect(api.list({ authorization: 'Bearer token', body: listBody })).resolves.toMatchObject({
      status: 404,
      body: { error: { code: 'ANALYSIS_NOT_READY' } },
    });
  });

  it('returns completed list metadata without validation arrays', async () => {
    const response = await routes().list({ authorization: 'Bearer token', body: listBody });
    expect(response).toMatchObject({
      status: 200,
      body: {
        analysisVersion: '114000123:v1',
        drawPeriod: '114000123',
        total: 1,
        items: [{ id: 'item-1' }],
        duplicateStats: [{ number: '03', count: 1 }],
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('ruleSets');
  });

  it('rejects validation from a different analysis version', async () => {
    const response = await routes().validation({
      authorization: 'Bearer token',
      body: {
        lottery: '今彩539',
        drawPeriod: '114000123',
        analysisVersion: 'old-version',
        itemId: 'item-1',
      },
    });
    expect(response).toMatchObject({
      status: 409,
      body: { error: { code: 'ANALYSIS_VERSION_MISMATCH' } },
    });
  });
});
