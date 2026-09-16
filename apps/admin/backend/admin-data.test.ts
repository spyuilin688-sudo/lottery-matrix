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
      line_user_id: 'line-user-1',
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
        memberId: 'm1',
        authUserId: 'u1',
        lineUserId: 'line-user-1',
        lineDisplayName: '測試暱稱',
        memberDisplayName: '測試暱稱',
        identityLabel: 'LINE ID',
        identityValue: 'line-user-1',
        identityDisplay: 'LINE ID：line-user-1',
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

  it('maps subscription LINE ID as the visible provider identity', async () => {
    const api = { request: fixtureRequest(async (path: string) => path.includes('member_online_sessions') ? [] : [{ id: 'm1', auth_user_id: 'u1', line_user_id: 'internal-line-id', line_display_name: 'LINE 暱稱', current_plan: null }]) };
    const result = await listAdminTable('subscriptions', api);
    expect(result.items[0]).toMatchObject({ lineUserId: 'internal-line-id', memberDisplayName: 'LINE 暱稱', identityDisplay: 'LINE ID：internal-line-id' });
  });

  it('maps the transfer applicant LINE display name', async () => {
    const api = { request: fixtureRequest(async () => [{
      id: 'transfer-1', member_id: 'member-1', plan_id: 'plan-1', amount: 1880,
      transferred_at: '2026-09-01T00:00:00Z', account_last_five: '12345',
      submitted_at: '2026-09-01T00:00:00Z', status: 'pending',
      plan: { name: '月費方案' }, member: { auth_user_id: 'auth-transfer', line_user_id: 'line-transfer', line_display_name: '小明' },
    }]) };
    const result = await listAdminTable('transferRequests', api);
    expect(result.items[0]).toMatchObject({ id: 'transfer-1', memberDisplayName: '小明', identityDisplay: 'LINE ID：line-transfer' });
    expect(api.request).toHaveBeenCalledWith(expect.stringContaining('member:members(auth_user_id,line_user_id,line_display_name)'));
  });

  it('maps payment member, plan, and reversal metadata for the administrative history', async () => {
    const api = { request: fixtureRequest(async () => [{
      id: 'payment-1', member_id: 'member-1', plan_id: 'plan-1', amount: 2880,
      paid_at: '2026-09-01T00:00:00Z', status: 'refunded', reversed_at: '2026-09-08T00:00:00Z',
      reversal_reason: '銀行退款已完成', reversed_by_name: '管理員',
      plan: { name: '月費方案' }, member: { auth_user_id: 'auth-transfer', line_user_id: 'line-transfer', line_display_name: '小明' },
    }]) };

    const result = await listAdminTable('subscriptionRecords', api);

    expect(result.items[0]).toMatchObject({
      id: 'payment-1', memberId: 'member-1', memberDisplayName: '小明', identityDisplay: 'LINE ID：line-transfer',
      planId: 'plan-1', planName: '月費方案', status: 'refunded',
      reversedAt: '2026-09-08T00:00:00Z', reversalReason: '銀行退款已完成', reversedByName: '管理員',
    });
    expect(api.request).toHaveBeenCalledWith(expect.stringContaining('member:members(auth_user_id,line_user_id,line_display_name)'));
    expect(api.request).toHaveBeenCalledWith(expect.stringContaining('plan:plans(name)'));
  });

  it('maps the activation-code redeemer member ID for provider-neutral administration', async () => {
    const api = { request: fixtureRequest(async () => [{
      id: 'code-1', batch_id: 'batch-1', code: 'ABCD-EFGH-IJKL-MNOP', duration_type: '30_days',
      created_at: '2026-09-05T00:00:00Z', expires_at: '2026-10-05T00:00:00Z',
      redeemed_by_member_id: 'member-1', redeemed_at: '2026-09-05T01:00:00Z', status: 'used',
      redeemed_member: { id: 'member-1', auth_user_id: 'auth-code', line_user_id: 'line-code', line_display_name: '兌換者暱稱' },
    }]) };

    const result = await listAdminTable('activationCodes', api);

    expect(result.items[0]).toMatchObject({ redeemedByMemberId: 'member-1', memberDisplayName: '兌換者暱稱', identityDisplay: 'LINE ID：line-code' });
    expect(api.request).toHaveBeenCalledWith(expect.stringContaining(
      'redeemed_member:members!activation_codes_redeemed_by_member_id_fkey(id,auth_user_id,line_user_id,line_display_name)',
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

  // Remaining tests intentionally unchanged.
});
