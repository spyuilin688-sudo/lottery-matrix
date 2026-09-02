import { describe, expect, it, vi } from 'vitest';
import { getDashboard, listAdminTable } from './admin-data';

describe('listAdminTable', () => {
  it('maps the stored LINE display name without exposing the LINE identifier', async () => {
    const api = { request: vi.fn(async () => [{
      id: 'm1',
      auth_user_id: 'u1',
      line_user_id: null,
      line_display_name: '小明',
      registered_at: '2026-08-01T00:00:00Z',
      current_plan_id: 'p1',
      plan_started_at: '2026-08-01T00:00:00Z',
      plan_expires_at: null,
      is_lifetime: false,
      auto_renew: true,
      status: 'active',
      referral_code: null,
      invitation_code: 'INVITE',
      last_online_at: '2026-08-21T10:30:00Z',
      total_online_seconds: 5400,
      online_session_count: 3,
      current_plan: { name: '月費方案' },
    }]) };

    await expect(listAdminTable('users', api)).resolves.toEqual({
      items: [{
        id: 'm1',
        authUserId: 'u1',
        lineDisplayName: '小明',
        registeredAt: '2026-08-01T00:00:00Z',
        currentPlanId: 'p1',
        planStartedAt: '2026-08-01T00:00:00Z',
        planExpiresAt: null,
        isLifetime: false,
        autoRenew: true,
        status: 'active',
        referralCode: null,
        invitationCode: 'INVITE',
        planName: '月費方案',
        lastOnlineAt: '2026-08-21T10:30:00Z',
        averageOnlineMinutes: 30,
      }],
    });
  });

  it('maps the transfer applicant LINE display name', async () => {
    const api = { request: vi.fn(async () => [{
      id: 'transfer-1',
      member_id: 'member-1',
      plan_id: 'plan-1',
      amount: 1880,
      transferred_at: '2026-09-01T00:00:00Z',
      account_last_five: '12345',
      submitted_at: '2026-09-01T00:00:00Z',
      status: 'pending',
      plan: { name: '月費方案' },
      member: { line_display_name: '小明' },
    }] ) };

    await expect(listAdminTable('transferRequests', api)).resolves.toEqual({
      items: [expect.objectContaining({
        id: 'transfer-1',
        lineDisplayName: '小明',
      })],
    });
    expect(api.request).toHaveBeenCalledWith(expect.stringContaining('member:members(line_display_name)'));
  });

  it('excludes super administrators from login and audit records', async () => {
    const request = vi.fn(async () => []);

    await listAdminTable('loginRecords', { request });
    await listAdminTable('auditLogs', { request });

    expect(request.mock.calls[0][0]).toContain('admin_account.role=neq.');
    expect(request.mock.calls[1][0]).toContain('admin_account.role=neq.');
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
      request: vi.fn(async (path: string) => {
        if (path.includes('/admin_revenue_settings?')) return [];
        return path.includes('/members?') ? [
          { plan_expires_at: '2026-08-25T00:00:00Z', current_plan: { duration_days: 30 } },
          { plan_expires_at: '2026-10-01T00:00:00Z', current_plan: { duration_days: 90 } },
          { plan_expires_at: null, current_plan: { duration_days: 365 } },
        ]
        : [
          { amount: 100, paid_at: '2026-08-21T01:00:00Z', status: 'confirmed' },
          { amount: 50, paid_at: '2026-08-01T01:00:00Z', status: 'confirmed' },
        ];
      }),
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

  it('keeps payment records while counting revenue only after the latest reset', async () => {
    const api = {
      request: vi.fn(async (path: string) => {
        if (path.includes('/admin_revenue_settings?')) {
          return [{ reset_at: '2026-08-21T02:00:00Z' }];
        }
        if (path.includes('/members?')) return [];
        return [
          { amount: 100, paid_at: '2026-08-21T01:00:00Z', status: 'confirmed' },
          { amount: 80, paid_at: '2026-08-21T03:00:00Z', status: 'confirmed' },
        ];
      }),
    };

    await expect(getDashboard(api, new Date('2026-08-21T12:00:00Z'))).resolves.toMatchObject({
      todayRevenue: 80,
      monthRevenue: 80,
      quarterRevenue: 80,
      yearRevenue: 80,
      cumulativeRevenue: 80,
    });
    expect(api.request).toHaveBeenCalledWith(expect.stringMatching(
      /\/rest\/v1\/payments\?.*paid_at=gte\.2026-08-21T02%3A00%3A00\.000Z/,
    ));
  });

  it('loads every confirmed-payment page before calculating revenue', async () => {
    const api = {
      request: vi.fn(async (path: string) => {
        if (path.includes('/admin_revenue_settings?')) return [];
        if (path.includes('/members?')) return [];
        if (path.includes('offset=0')) {
          return Array.from({ length: 1000 }, (_, index) => ({
            id: `payment-${index}`,
            amount: 1,
            paid_at: '2026-08-21T01:00:00Z',
            status: 'confirmed',
          }));
        }
        if (path.includes('offset=1000')) {
          return [{ id: 'payment-1000', amount: 5, paid_at: '2026-08-21T02:00:00Z', status: 'confirmed' }];
        }
        return [];
      }),
    };

    await expect(getDashboard(api, new Date('2026-08-21T12:00:00Z'))).resolves.toMatchObject({
      todayRevenue: 1005,
      cumulativeRevenue: 1005,
    });
    expect(api.request).toHaveBeenCalledWith(expect.stringContaining('offset=1000'));
  });
});
