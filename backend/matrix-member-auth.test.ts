import { describe, expect, it, vi } from 'vitest';
import { createMemberAuth } from './matrix-member-auth';

const config = async () => ({
  url: 'https://db.test',
  anonKey: 'anon-key',
  serviceRoleKey: 'service-key',
});

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sequenceFetcher(values: Response[]) {
  return vi.fn(async () => {
    const value = values.shift();
    if (!value) throw new Error('unexpected fetch');
    return value;
  });
}

describe('Matrix member authentication', () => {
  it('rejects a missing bearer token before any Supabase call', async () => {
    const fetcher = vi.fn();
    const auth = createMemberAuth(config, fetcher);

    await expect(auth.requireMember(undefined)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      status: 401,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses the Auth user id to resolve the member, plan and confirmed referrals', async () => {
    const fetcher = sequenceFetcher([
      jsonResponse({ id: 'auth-1' }),
      jsonResponse([{
        id: 'member-1',
        auth_user_id: 'auth-1',
        is_lifetime: false,
        plan_expires_at: '2026-09-01T00:00:00Z',
        current_plan: { name: '季費方案' },
        referral_code: 'ABC',
      }]),
      jsonResponse([{ id: 'referred-1' }, { id: 'referred-1' }, { id: 'referred-2' }]),
    ]);
    const auth = createMemberAuth(config, fetcher, () => new Date('2026-08-21T00:00:00Z'));

    await expect(auth.requireMember('Bearer access-token')).resolves.toEqual({
      authUserId: 'auth-1',
      memberId: 'member-1',
      plan: 'quarterly',
      active: true,
      referralSuccessCount: 2,
    });

    expect(fetcher).toHaveBeenNthCalledWith(1, 'https://db.test/auth/v1/user', {
      headers: { apikey: 'anon-key', Authorization: 'Bearer access-token' },
    });
    expect(String(fetcher.mock.calls[1]?.[0])).toContain('auth_user_id=eq.auth-1');
    expect(String(fetcher.mock.calls[2]?.[0])).toContain('payments.status=eq.confirmed');
  });

  it('keeps the resolved plan but marks an expired member inactive', async () => {
    const fetcher = sequenceFetcher([
      jsonResponse({ id: 'auth-1' }),
      jsonResponse([{
        id: 'member-1',
        auth_user_id: 'auth-1',
        is_lifetime: false,
        plan_expires_at: '2026-08-20T23:59:59Z',
        current_plan: { name: '月費方案' },
        referral_code: null,
      }]),
    ]);

    await expect(
      createMemberAuth(config, fetcher, () => new Date('2026-08-21T00:00:00Z'))
        .requireMember('Bearer token'),
    ).resolves.toMatchObject({ plan: 'monthly', active: false, referralSuccessCount: 0 });
  });
});
