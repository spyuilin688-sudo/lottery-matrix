import { describe, expect, it, vi } from 'vitest';
import { createMemberProfileStore } from './member-profile-store';

describe('member profile store', () => {
  it('maps a member without a paid plan to the free member label', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{
      line_user_id: 'line-free',
      plan_expires_at: null,
      is_lifetime: false,
      current_plan: null,
    }]), { status: 200 }));
    const store = createMemberProfileStore(
      () => ({ url: 'https://project.supabase.co', serviceRoleKey: 'service-role-secret' }),
      fetcher,
    );

    await expect(store.read('member-free')).resolves.toEqual({
      lineUserId: 'line-free',
      planName: '免費會員',
      planExpiresAt: null,
      isLifetime: false,
    });
  });

  it('maps a lifetime member without a current plan to a real lifetime plan label', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{
      line_user_id: 'line-lifetime',
      plan_expires_at: null,
      is_lifetime: true,
      current_plan: null,
    }]), { status: 200 }));
    const store = createMemberProfileStore(
      () => ({ url: 'https://project.supabase.co', serviceRoleKey: 'service-role-secret' }),
      fetcher,
    );

    await expect(store.read('member-1')).resolves.toEqual({
      lineUserId: 'line-lifetime',
      planName: '終身方案',
      planExpiresAt: null,
      isLifetime: true,
    });
    const [url, init] = fetcher.mock.calls[0];
    const requestUrl = new URL(String(url));
    expect(requestUrl.searchParams.get('id')).toBe('eq.member-1');
    expect(requestUrl.searchParams.get('limit')).toBe('1');
    expect(init?.headers).toMatchObject({
      apikey: 'service-role-secret',
      Authorization: 'Bearer service-role-secret',
    });
  });

  it('uses the lifetime plan label even when a joined plan is present', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{
      line_user_id: 'line-lifetime',
      plan_expires_at: '2028-01-01T00:00:00.000Z',
      is_lifetime: true,
      current_plan: { name: '年費方案' },
    }]), { status: 200 }));
    const store = createMemberProfileStore(
      () => ({ url: 'https://project.supabase.co', serviceRoleKey: 'service-role-secret' }),
      fetcher,
    );

    await expect(store.read('member-1')).resolves.toMatchObject({
      planName: '終身方案',
      isLifetime: true,
    });
  });
});
