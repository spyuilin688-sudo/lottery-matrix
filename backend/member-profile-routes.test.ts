import { describe, expect, it, vi } from 'vitest';
import { createMemberProfileRoutes } from './member-profile-routes';
import type { MemberContext } from './matrix-entitlements';

const member: MemberContext = {
  authUserId: 'user-1',
  memberId: 'member-1',
  plan: 'monthly',
  active: true,
  referralSuccessCount: 0,
};

describe('member profile routes', () => {
  it('returns only the authenticated member profile fields', async () => {
    const readProfile = vi.fn(async () => ({
      lineUserId: 'line-1',
      planName: '月費方案',
      planExpiresAt: '2026-09-22T00:00:00.000Z',
      isLifetime: false,
    }));
    const api = createMemberProfileRoutes({
      requireMember: async () => member,
      readProfile,
    });

    await expect(api.get({ authorization: 'Bearer token' })).resolves.toEqual({
      status: 200,
      body: {
        lineUserId: 'line-1',
        planName: '月費方案',
        planExpiresAt: '2026-09-22T00:00:00.000Z',
        isLifetime: false,
      },
    });
    expect(readProfile).toHaveBeenCalledWith('member-1');
  });

  it('does not expose backend failure details', async () => {
    const api = createMemberProfileRoutes({
      requireMember: async () => member,
      readProfile: async () => { throw new Error('SUPABASE_PRIVATE_DETAIL'); },
    });

    await expect(api.get({ authorization: 'Bearer token' })).resolves.toEqual({
      status: 502,
      body: { error: { code: 'MEMBER_PROFILE_READ_FAILED' } },
    });
  });
});
