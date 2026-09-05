import { describe, expect, it, vi } from 'vitest';
import { getDashboard, listAdminTable } from './admin-data';

describe('listAdminTable', () => {
  it('maps only real member columns and preserves nulls', async () => {
    const api = { request: vi.fn(async (path: string) => path.includes('member_online_sessions') ? [{ member_id: 'm1', online_seconds: 1800 }, { member_id: 'm1', online_seconds: 900 }] : [{
      id: 'm1',
      auth_user_id: 'u1',
      line_user_id: null,
      line_display_name: '測試暱稱',
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

    await expect(listAdminTable('users', api, new Date('2026-08-21T12:00:00Z'))).resolves.toEqual({
      items: [{
        id: 'm1',
        authUserId: 'u1',
        lineDisplayName: '測試暱稱',
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
        recentOnlineMinutes: 45,
      }],
    });
  });

  it('maps subscription LINE nickname without exposing the LINE user ID', async () => {
    const api = { request: vi.fn(async (path: string) => path.includes('member_online_sessions') ? [] : [{ id: 'm1', auth_user_id: 'u1', line_user_id: 'internal-line-id', line_display_name: 'LINE 暱稱', current_plan: null }]) };
    const result = await listAdminTable('subscriptions', api);
    expect(result.items[0]).toMatchObject({ lineDisplayName: 'LINE 暱稱' });
    expect(result.items[0]).not.toHaveProperty('lineUserId');
  });

  it('maps the transfer applicant LINE display name', async () => {
    const api = { request: vi.fn(async () => [{
      id: 'transfer-1', member_id: 'member-1', plan_id: 'plan-1', amount: 1880,
      transferred_at: '2026-09-01T00:00:00Z', account_last_five: '12345',
      submitted_at: '2026-09-01T00:00:00Z', status: 'pending',
      plan: { name: '月費方案' }, member: { line_display_name: '小明' },
    }]) };
    const result = await listAdminTable('transferRequests', api);
    expect(result.items[0]).toMatchObject({ id: 'transfer-1', lineDisplayName: '小明' });
    expect(api.request).toHaveBeenCalledWith(expect.stringContaining('member:members(line_display_name)'));
  });

  it('maps the activation-code redeemer LINE nickname without exposing the member ID', async () => {
    const api = { request: vi.fn(async () => [{
      id: 'code-1', batch_id: 'batch-1', code: 'ABCD-EFGH-IJKL-MNOP', duration_type: '30_days',
      created_at: '2026-09-05T00:00:00Z', expires_at: '2026-10-05T00:00:00Z',
      redeemed_by_member_id: 'member-1', redeemed_at: '2026-09-05T01:00:00Z', status: 'used',
      redeemed_member: { line_display_name: '兌換者暱稱' },
    }]) };

    const result = await listAdminTable('activationCodes', api);

    expect(result.items[0]).toMatchObject({ redeemedByLineDisplayName: '兌換者暱稱' });
    expect(result.items[0]).not.toHaveProperty('redeemedByMemberId');
    expect(api.request).toHaveBeenCalledWith(expect.stringContaining(
      'redeemed_member:members!activation_codes_redeemed_by_member_id_fkey(line_display_name)',
    ));
  });

  it('excludes super administrators from login records without hiding historical audit rows', async () => {
    const request = vi.fn(async () => []);
    await listAdminTable('loginRecords', { request });
    await listAdminTable('auditLogs', { request });
    expect(request.mock.calls[0][0]).toContain('admin_account.role=neq.');
    expect(request.mock.calls[1][0]).not.toContain('admin_account.role=neq.');
  });

  it('maps administrator permission columns into the existing permission object', async () => {
    const api = { request: vi.fn(async () => [{
      id: 'a1', account: 'owner@example.com', name: 'Owner', role: '查看人員', status: '啟用',
      can_view: true, can_add: false, can_edit: false, can_delete: false,
      last_login_at: null, created_at: '2026-08-01T00:00:00Z',
    }]) };
    await expect(listAdminTable('admins', api)).resolves.toEqual({ items: [{
      id: 'a1', account: 'owner@example.com', name: 'Owner', role: '查看人員', status: '啟用',
      permissions: { view: true, add: false, edit: false, delete: false }, lastLoginAt: null, createdAt: '2026-08-01T00:00:00Z',
    }] });
  });

  it('rejects tables that are not explicitly mapped', async () => {
    const api = { request: vi.fn() };
    await expect(listAdminTable('secrets', api)).rejects.toMatchObject({ statusCode: 400 });
    expect(api.request).not.toHaveBeenCalled();
  });
});

describe('getDashboard', () => {
  it('derives plan counts and confirmed revenue only from real Supabase columns', async () => {
    const api = { request: vi.fn(async (path: string) => path.includes('/rpc/admin_visitor_stats') ? { todayVisitors: 2, monthVisitors: 7, totalVisitors: 10 } : path.includes('/members?') ? [
      { plan_expires_at: '2026-08-25T00:00:00Z', current_plan: { duration_days: 30 } },
      { plan_expires_at: '2026-10-01T00:00:00Z', current_plan: { duration_days: 90 } },
      { plan_expires_at: null, current_plan: { duration_days: 365 } },
    ] : [
      { amount: 100, paid_at: '2026-08-21T01:00:00Z', status: 'confirmed' },
      { amount: 50, paid_at: '2026-08-01T01:00:00Z', status: 'confirmed' },
    ]) };
    await expect(getDashboard(api, new Date('2026-08-21T12:00:00Z'))).resolves.toEqual({
      todayVisitors: 2, monthVisitors: 7, totalVisitors: 10,
      totalUsers: 3, monthlyPro: 1, quarterlyPro: 1, yearlyPro: 1, expiring: 1,
      todayRevenue: 100, monthRevenue: 150, quarterRevenue: 150, yearRevenue: 150, cumulativeRevenue: 150,
    });
  });
});

 it('keeps existing dashboard data when visitor counts are unavailable', async () => {
  const api = { request: vi.fn(async (path: string) => {
    if (path.includes('/rpc/admin_visitor_stats')) throw Error('unavailable');
    return [];
  }) };
  expect(await getDashboard(api)).toMatchObject({ todayVisitors: null, monthVisitors: null, totalVisitors: null, totalUsers: 0, cumulativeRevenue: 0 });
});
