import { describe, expect, it, vi } from 'vitest';
import { getDashboard, listAdminLoginRecordPage, listAdminMemberPage, listAdminTable } from './admin-data';

// Model the REST offset/limit behavior for fixture-backed table responses.
const fixtureRequest = (respond: (path: string) => Promise<unknown>, serverCap = 1000) => vi.fn(async (path: string) => {
  const data = await respond(path);
  if (!Array.isArray(data)) return data;
  const query = new URL(path, 'https://example.test').searchParams;
  const offset = Number(query.get('offset') ?? 0);
  const limit = Math.min(Number(query.get('limit') ?? serverCap), serverCap);
  return data.slice(offset, offset + limit);
});

describe('listAdminTable', () => {
  it('maps only real member columns and preserves nulls', async () => {
    const api = { request: fixtureRequest(async (path: string) => path.includes('member_online_sessions') ? [{ member_id: 'm1', online_seconds: 1800 }, { member_id: 'm1', online_seconds: 900 }] : [{
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
        recentIp: null,
        estimatedRegion: null,
      }],
    });
  });

  it('maps subscription LINE nickname without exposing the LINE user ID', async () => {
    const api = { request: fixtureRequest(async (path: string) => path.includes('member_online_sessions') ? [] : [{ id: 'm1', auth_user_id: 'u1', line_user_id: 'internal-line-id', line_display_name: 'LINE 暱稱', current_plan: null }]) };
    const result = await listAdminTable('subscriptions', api);
    expect(result.items[0]).toMatchObject({ lineDisplayName: 'LINE 暱稱' });
    expect(result.items[0]).not.toHaveProperty('lineUserId');
  });

  it('maps the transfer applicant LINE display name', async () => {
    const api = { request: fixtureRequest(async () => [{
      id: 'transfer-1', member_id: 'member-1', plan_id: 'plan-1', amount: 1880,
      transferred_at: '2026-09-01T00:00:00Z', account_last_five: '12345',
      submitted_at: '2026-09-01T00:00:00Z', status: 'pending',
      plan: { name: '月費方案' }, member: { line_display_name: '小明' },
    }]) };
    const result = await listAdminTable('transferRequests', api);
    expect(result.items[0]).toMatchObject({ id: 'transfer-1', lineDisplayName: '小明' });
    expect(api.request).toHaveBeenCalledWith(expect.stringContaining('member:members(line_display_name)'));
  });

  it('maps payment member, plan, and reversal metadata for the administrative history', async () => {
    const api = { request: fixtureRequest(async () => [{
      id: 'payment-1', member_id: 'member-1', plan_id: 'plan-1', amount: 2880,
      paid_at: '2026-09-01T00:00:00Z', status: 'refunded', reversed_at: '2026-09-08T00:00:00Z',
      reversal_reason: '銀行退款已完成', reversed_by_name: '管理員',
      plan: { name: '月費方案' }, member: { line_display_name: '小明' },
    }]) };

    const result = await listAdminTable('subscriptionRecords', api);

    expect(result.items[0]).toMatchObject({
      id: 'payment-1', memberId: 'member-1', lineDisplayName: '小明',
      planId: 'plan-1', planName: '月費方案', status: 'refunded',
      reversedAt: '2026-09-08T00:00:00Z', reversalReason: '銀行退款已完成', reversedByName: '管理員',
    });
    expect(api.request).toHaveBeenCalledWith(expect.stringContaining('member:members(line_display_name)'));
    expect(api.request).toHaveBeenCalledWith(expect.stringContaining('plan:plans(name)'));
  });

  it('maps the activation-code redeemer LINE nickname without exposing the member ID', async () => {
    const api = { request: fixtureRequest(async () => [{
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
    const request = fixtureRequest(async () => []);
    await listAdminTable('loginRecords', { request });
    await listAdminTable('auditLogs', { request });
    expect(request.mock.calls[0][0]).toContain('admin_account.role=neq.');
    expect(request.mock.calls[1][0]).not.toContain('admin_account.role=neq.');
  });

  it('restores the estimated login city beside an administrator IP address', async () => {
    const checkedAt = new Date().toISOString();
    const request = fixtureRequest(async (path) => {
      if (path.includes('/admin_login_records?')) return [{
        id: 'login-1', account: 'operator@example.com', login_at: '2026-09-10T10:00:00Z',
        logout_at: null, online_minutes: 5, ip: '1.2.3.4', device: 'Chrome',
      }];
      if (path.includes('/member_ip_locations?')) return [{ ip: '1.2.3.4', country_code: 'TW', city: 'Taipei', checked_at: checkedAt }];
      return [];
    });

    await expect(listAdminTable('loginRecords', { request })).resolves.toEqual({ items: [expect.objectContaining({
      id: 'login-1', ip: '1.2.3.4', estimatedRegion: '台灣・台北市',
    })] });
  });

  it('maps administrator permission columns into the existing permission object', async () => {
    const api = { request: fixtureRequest(async () => [{
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

describe('listAdminMemberPage subscriptions', () => {
  it.each([
    ['all', 'in.(30,90,365)'],
    ['monthly', 'eq.30'],
    ['quarterly', 'eq.90'],
    ['yearly', 'eq.365'],
  ])('lists only current successful fixed-duration subscriptions for %s', async (plan, durationFilter) => {
    const request = vi.fn(async () => []);
    const requestPage = vi.fn(async () => ({ items: [], total: 0 }));

    await listAdminMemberPage('subscriptions', { page: 1, keyword: '', status: 'all', plan }, { request, requestPage }, new Date('2026-09-11T00:00:00.000Z'));

    const url = new URL(requestPage.mock.calls[0][0], 'https://example.test');
    expect(url.searchParams.get('select')).toContain('!inner');
    expect(url.searchParams.get('current_plan.duration_days')).toBe(durationFilter);
    expect(url.searchParams.get('plan_expires_at')).toBe('gt.2026-09-11T00:00:00.000Z');
    expect(url.searchParams.get('is_lifetime')).toBe('eq.false');
    expect(url.searchParams.has('status')).toBe(false);
    expect(url.searchParams.get('and')).toBe('(or(status.in.(active,啟用),status.is.null))');
  });

  it('rejects an unknown subscription plan filter before querying Supabase', async () => {
    const api = { request: vi.fn(async () => []), requestPage: vi.fn(async () => ({ items: [], total: 0 })) };
    await expect(listAdminMemberPage('subscriptions', { plan: 'lifetime' }, api)).rejects.toMatchObject({ statusCode: 400 });
    expect(api.requestPage).not.toHaveBeenCalled();
  });
});

describe('listAdminLoginRecordPage', () => {
  it('reads ten rows per server page and enriches every visible IP', async () => {
    const checkedAt = new Date().toISOString();
    const request = vi.fn(async (path: string) => path.includes('/member_ip_locations?')
      ? [{ ip: '1.2.3.4', country_code: 'TW', city: 'Taipei', checked_at: checkedAt }]
      : []);
    const requestPage = vi.fn(async () => ({ items: [{
      id: 'login-11', account: 'operator@example.com', login_at: '2026-09-10T10:00:00Z',
      logout_at: null, online_minutes: 5, ip: '1.2.3.4', device: 'Chrome',
    }], total: 21 }));

    const result = await listAdminLoginRecordPage({ page: 2 }, { request, requestPage });

    expect(result).toMatchObject({ total: 21, currentPage: 2, totalPages: 3, items: [expect.objectContaining({ estimatedRegion: '台灣・台北市' })] });
    const url = new URL(requestPage.mock.calls[0][0], 'https://example.test');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('offset')).toBe('10');
  });
});

describe('getDashboard', () => {
  it('derives plan counts and confirmed revenue only from real Supabase columns', async () => {
    const api = { request: fixtureRequest(async (path: string) => path.includes('/rpc/admin_visitor_stats') ? { todayVisitors: 2, monthVisitors: 7, totalVisitors: 10 } : path.includes('/members?') ? [
      { plan_expires_at: '2026-08-25T00:00:00Z', status: 'active', current_plan: { duration_days: 30 } },
      { plan_expires_at: '2026-10-01T00:00:00Z', status: 'active', current_plan: { duration_days: 90 } },
      { plan_expires_at: '2027-08-21T00:00:00Z', status: 'active', current_plan: { duration_days: 365 } },
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

  it('counts only enabled 30, 90, and 365-day plans with a finite future expiry', async () => {
    const currentDate = new Date('2026-09-08T12:00:00Z');
    const api = { request: fixtureRequest(async (path: string) => path.includes('/members?') ? [
      { plan_expires_at: '2026-09-09T12:00:00Z', status: 'active', current_plan: { duration_days: 30 } },
      { plan_expires_at: '2026-12-08T12:00:00Z', status: null, current_plan: { duration_days: 90 } },
      { plan_expires_at: '2027-09-08T12:00:00Z', status: '啟用', current_plan: { duration_days: 365 } },
      { plan_expires_at: '2026-09-08T11:59:59Z', status: 'active', current_plan: { duration_days: 30 } },
      { plan_expires_at: '2026-09-08T12:00:00Z', status: 'active', current_plan: { duration_days: 90 } },
      { plan_expires_at: '2027-09-08T12:00:00Z', status: '停用', current_plan: { duration_days: 365 } },
      { plan_expires_at: '2027-09-08T12:00:00Z', status: 'disabled', current_plan: { duration_days: 30 } },
      { plan_expires_at: '2027-09-08T12:00:00Z', status: 'inactive', current_plan: { duration_days: 90 } },
      { plan_expires_at: 'not-a-date', status: 'active', current_plan: { duration_days: 365 } },
      { plan_expires_at: null, is_lifetime: true, status: 'active', current_plan: { duration_days: 30 } },
      { plan_expires_at: '2027-09-08T12:00:00Z', status: 'active', current_plan: null },
    ] : []) };

    await expect(getDashboard(api, currentDate)).resolves.toMatchObject({
      totalUsers: 11,
      monthlyPro: 1,
      quarterlyPro: 1,
      yearlyPro: 1,
    });
    expect(api.request).toHaveBeenCalledWith(expect.stringContaining('select=plan_expires_at,status,'));
  });
});

 it('keeps existing dashboard data when visitor counts are unavailable', async () => {
  const api = { request: fixtureRequest(async (path: string) => {
    if (path.includes('/rpc/admin_visitor_stats')) throw Error('unavailable');
    return [];
  }) };
  expect(await getDashboard(api)).toMatchObject({ todayVisitors: null, monthVisitors: null, totalVisitors: null, totalUsers: 0, cumulativeRevenue: 0 });
});

describe('complete admin data pagination', () => {
  it.each(['users', 'subscriptions', 'loginRecords', 'subscriptionRecords', 'auditLogs', 'admins', 'activationCodes', 'plans', 'transferRequests'])(
    'keeps every %s row accessible across capped pages and tied sort values', async (table) => {
      const rows = Array.from({ length: 1105 }, (_, index) => ({ id: String(index), created_at: '2026-09-01T00:00:00Z' }));
      const request = fixtureRequest(async (path) => path.includes('member_online_sessions') ? [] : rows, 137);
      const result = await listAdminTable(table, { request });
      expect(result.items.map((item) => item.id)).toEqual(rows.map((row) => row.id));
      const paths = request.mock.calls.map(([path]) => path).filter((path) => !path.includes('member_online_sessions'));
      expect(paths.length).toBeGreaterThan(2);
      for (const path of paths) {
        const query = new URL(path, 'https://example.test').searchParams;
        expect(query.get('order')).toMatch(/(?:^|,)id\.(?:asc|desc)$/);
        expect(Number(query.get('limit'))).toBeLessThanOrEqual(1000);
      }
    },
  );

  it('includes recent online time from every page for both member tables', async () => {
    const request = fixtureRequest(async (path) => path.includes('member_online_sessions')
      ? Array.from({ length: 1105 }, () => ({ member_id: 'm1', online_seconds: 60 }))
      : [{ id: 'm1' }], 137);
    for (const table of ['users', 'subscriptions']) {
      const result = await listAdminTable(table, { request });
      expect(result.items[0]).toMatchObject({ recentOnlineMinutes: 1105 });
    }
    expect(request.mock.calls.filter(([path]) => path.includes('member_online_sessions')).every(([path]) => path.includes('order=id.asc'))).toBe(true);
  });

  it('counts dashboard members beyond the server cap', async () => {
    const request = fixtureRequest(async (path) => path.includes('/members?')
      ? Array.from({ length: 1105 }, () => ({ current_plan: { duration_days: 30 }, plan_expires_at: '2026-09-07T00:00:00Z' }))
      : [], 137);
    expect(await getDashboard({ request }, new Date('2026-09-06T00:00:00Z'))).toMatchObject({ totalUsers: 1105, monthlyPro: 1105, expiring: 1105 });
  });

  it('rejects a later page failure instead of returning incomplete records', async () => {
    const request = vi.fn(async (path: string) => {
      if (Number(new URL(path, 'https://example.test').searchParams.get('offset')) > 0) throw new Error('page unavailable');
      return [{ id: 'first' }];
    });
    await expect(listAdminTable('auditLogs', { request })).rejects.toThrow('page unavailable');
  });
});
