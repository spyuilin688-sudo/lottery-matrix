import { beforeEach, expect, test, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  rpc: vi.fn(),
  scope: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  getSupabaseClient: () => ({
    rpc: sdk.rpc,
    auth: {
      getUser: sdk.getUser,
      signOut: sdk.signOut,
    },
  }),
}));

vi.mock('../auth/algorithm-cache-scope', () => ({
  getAlgorithmCacheScope: sdk.scope,
}));

import { bootstrapMember, fetchMemberProfile } from '../member-api';

beforeEach(() => {
  sdk.rpc.mockReset();
  sdk.scope.mockReset();
  sdk.getUser.mockReset();
  sdk.signOut.mockReset();
});

function simulateOneSessionChange() {
  sdk.scope
    .mockReturnValueOnce(1)
    .mockReturnValueOnce(2)
    .mockReturnValue(2);
}

test.each([
  ['member_bootstrap', bootstrapMember, { memberId: 'member', lineUserId: 'line-member' }],
  ['member_profile', fetchMemberProfile, {
    memberId: 'member',
    lineUserId: 'line-member',
    planName: null,
    planExpiresAt: null,
    isLifetime: false,
    exploreEntitlements: {
      canUseSeven: true,
      canUseThirteen: true,
      canUseFullRange: true,
    },
  }],
] as const)('%s 在 session generation 改變時只重試一次並取得新會員資料', async (rpcName, call, data) => {
  simulateOneSessionChange();
  sdk.rpc.mockResolvedValue({ data, error: null });

  await expect(call()).resolves.toEqual(data);

  expect(sdk.rpc).toHaveBeenCalledTimes(2);
  expect(sdk.rpc).toHaveBeenNthCalledWith(1, rpcName);
  expect(sdk.rpc).toHaveBeenNthCalledWith(2, rpcName);
});

test('一般 member_profile 錯誤不重試', async () => {
  const error = { code: '42501', message: 'AUTH_REQUIRED' };
  sdk.scope.mockReturnValue(1);
  sdk.rpc.mockResolvedValue({ data: null, error });

  await expect(fetchMemberProfile()).rejects.toBe(error);
  expect(sdk.rpc).toHaveBeenCalledTimes(1);
});

test('session 連續變更時最多只重試一次', async () => {
  sdk.scope
    .mockReturnValueOnce(1)
    .mockReturnValueOnce(2)
    .mockReturnValueOnce(2)
    .mockReturnValueOnce(3);
  sdk.rpc.mockResolvedValue({
    data: { memberId: 'member', lineUserId: 'line-member' },
    error: null,
  });

  await expect(bootstrapMember()).rejects.toThrow('MEMBER_SESSION_CHANGED');
  expect(sdk.rpc).toHaveBeenCalledTimes(2);
});
