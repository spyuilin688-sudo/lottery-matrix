import { describe, expect, it, vi } from 'vitest';
import { anonymousMatrixMember, resolveMatrixEntitlements, type MemberContext } from './matrix-entitlements';
import { createMemberAuth } from './matrix-member-auth';
import { createMatrixTianyanRoutes } from './matrix-tianyan-routes';
import { createMatrixTiangongRoutes } from './matrix-tiangong-routes';

const start = '2026-09-09T04:00:00.000Z';
const member = { authUserId: 'auth-new', memberId: 'member-new', plan: 'free', active: false,
  referralSuccessCount: 0, lineTrialStartedAt: start } as MemberContext;

describe('LINE registration algorithm trials', () => {
  it.each([
    [0, true, true], [24 * 3600_000 - 1, true, true], [24 * 3600_000, true, false],
    [48 * 3600_000 - 1, true, false], [48 * 3600_000, false, false],
  ])('expires each algorithm at elapsed %i milliseconds', (elapsed, tianyan, tiangong) => {
    expect(resolveMatrixEntitlements(member, new Date(Date.parse(start) + elapsed))).toMatchObject({
      canUseTianyan: tianyan, canUseTiangong: tiangong,
      canUseThirteen: false, canUseFullRange: false, canCustomizeStatus: false,
      canViewFullStatus: false, canUseCompositeCustomRoad: false,
    });
  });

  it.each([undefined, null, 'invalid', '2026-09-10T04:00:00Z'])('rejects absent or invalid start %s', (lineTrialStartedAt) => {
    expect(resolveMatrixEntitlements({ ...member, lineTrialStartedAt }, new Date(start))).toMatchObject({
      canUseTianyan: false, canUseTiangong: false,
    });
  });

  it('does not grant a visitor trial access and preserves a paid plan after trial expiry', () => {
    expect(resolveMatrixEntitlements({ ...anonymousMatrixMember, lineTrialStartedAt: start }, new Date(start))).toMatchObject({
      canUseTianyan: false, canUseTiangong: false,
    });
    expect(resolveMatrixEntitlements({ ...member, plan: 'yearly', active: true }, new Date('2026-09-12T04:00:00Z'))).toMatchObject({
      canUseTianyan: true, canUseTiangong: true,
    });
  });

  it('loads the trial timestamp from the stored member, never editable auth metadata', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'auth-new', user_metadata: { lineTrialStartedAt: '2099-01-01' } })))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'member-new', status: '啟用',
        line_trial_started_at: start, current_plan: null }])));
    const auth = createMemberAuth(() => ({ url: 'https://db.test', anonKey: 'anon', serviceRoleKey: 'service' }), fetcher);
    expect(await auth.requireMember('Bearer token')).toMatchObject({ lineTrialStartedAt: start, plan: 'free' });
    expect(new URL(String(fetcher.mock.calls[1][0])).searchParams.get('select')).toContain('line_trial_started_at');
  });

  it('passes the algorithm authorization gates during the trial and denies expired access', async () => {
    for (const [createRoutes, body] of [
      [createMatrixTianyanRoutes, { lottery: '今彩539', selectedStreaks: ['準9進10'] }],
      [createMatrixTiangongRoutes, { lottery: '今彩539', periodRange: 50, mode: 'two-stage', hitCondition: '準2進3',
        exploreDirections: ['固定'], firstStageDirections: ['固定'], firstRoadTypes: ['加減'],
        secondStageDirections: ['固定'], secondRoadTypes: ['合值'] }],
    ] as const) {
      const readAnalysis = vi.fn(async () => null);
      const api = createRoutes({ requireMember: async () => member, readAnalysis, now: () => new Date(start) });
      expect(await api.list({ authorization: 'Bearer token', body })).toMatchObject({ status: 404 });
      expect(readAnalysis).toHaveBeenCalledOnce();
      const expired = createRoutes({ requireMember: async () => member, readAnalysis, now: () => new Date('2026-09-12T04:00:00Z') });
      expect(await expired.list({ authorization: 'Bearer token', body })).toMatchObject({ status: 403 });
    }
  });
});
