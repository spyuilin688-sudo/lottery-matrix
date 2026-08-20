import { describe, expect, it, vi } from 'vitest';
import { getDashboard, listAdminTable } from './admin-data';

describe('listAdminTable', () => {
  it('maps only real member columns and preserves nulls', async () => {
    const api = { request: vi.fn(async () => [{
      id: 'm1',
      auth_user_id: 'u1',
      line_user_id: null,
      registered_at: '2026-08-01T00:00:00Z',
      current_plan_id: 'p1',
      plan_started_at: '2026-08-01T00:00:00Z',
      plan_expires_at: null,
      is_lifetime: false,
      status: 'active',
      referral_code: null,
      invitation_code: 'INVITE',
    }]) };

    await expect(listAdminTable('users', api)).resolves.toEqual({
      items: [{
        id: 'm1',
        authUserId: 'u1',
        lineUserId: null,
        registeredAt: '2026-08-01T00:00:00Z',
        currentPlanId: 'p1',
        planStartedAt: '2026-08-01T00:00:00Z',
        planExpiresAt: null,
        isLifetime: false,
        status: 'active',
        referralCode: null,
        invitationCode: 'INVITE',
      }],
    });
  });

  it('maps administrator permission columns into the existing permission object', async () => {
    const api = { request: vi.fn(async () => [{
      id: 'a1',
      account: 'owner@example.com',
      name: 'Owner',
      role: '查看人員',
      status: '啟用',
      can_view: true,
      can_add: false,
      can_edit: false,
      can_delete: false,
      last_login_at: null,
      created_at: '2026-08-01T00:00:00Z',
    }]) };

    await expect(listAdminTable('admins', api)).resolves.toEqual({
      items: [{
        id: 'a1',
        account: 'owner@example.com',
        name: 'Owner',
        role: '查看人員',
        status: '啟用',
        permissions: { view: true, add: false, edit: false, delete: false },
        lastLoginAt: null,
        createdAt: '2026-08-01T00:00:00Z',
      }],
    });
  });

  it('rejects tables that are not explicitly mapped', async () => {
    const api = { request: vi.fn() };
    await expect(listAdminTable('secrets', api)).rejects.toMatchObject({ statusCode: 400 });
    expect(api.request).not.toHaveBeenCalled();
  });
});

describe('getDashboard', () => {
  it('derives plan counts and confirmed revenue only from real Supabase columns', async () => {
    const api = {
      request: vi.fn(async (path: string) => path.includes('/members?')
        ? [
          { plan_expires_at: '2026-08-25T00:00:00Z', current_plan: { duration_days: 30 } },
          { plan_expires_at: '2026-10-01T00:00:00Z', current_plan: { duration_days: 90 } },
          { plan_expires_at: null, current_plan: { duration_days: 365 } },
        ]
        : [
          { amount: 100, paid_at: '2026-08-21T01:00:00Z', status: 'confirmed' },
          { amount: 50, paid_at: '2026-08-01T01:00:00Z', status: 'confirmed' },
        ]),
    };

    await expect(getDashboard(api, new Date('2026-08-21T12:00:00Z'))).resolves.toEqual({
      totalUsers: 3,
      monthlyPro: 1,
      quarterlyPro: 1,
      yearlyPro: 1,
      expiring: 1,
      todayRevenue: 100,
      monthRevenue: 150,
      quarterRevenue: 150,
      yearRevenue: 150,
      cumulativeRevenue: 150,
    });
  });
});
