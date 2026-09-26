import { describe, expect, it, vi } from 'vitest';

import { isPrivateActivationOwner, maskPrivateAuditRows, maskPrivateMemberEntitlements, privateActivationCodePath } from './private-activation';
import { listAdminMemberPage, listAdminTablePage } from './admin-data';

const owner = { account: 'spyuilin688@gmail.com', role: '超級管理員' };
const operator = { account: 'operator@example.com', role: '營運管理員' };

describe('private activation code access', () => {
  it('requires both the designated account and the super administrator role', () => {
    expect(isPrivateActivationOwner(owner)).toBe(true);
    expect(isPrivateActivationOwner({ ...owner, role: '營運管理員' })).toBe(false);
    expect(isPrivateActivationOwner({ account: 'other@example.com', role: '超級管理員' })).toBe(false);
  });

  it('filters code rows by scope before pagination', () => {
    expect(privateActivationCodePath(false)).toContain('batch.is_private=eq.false');
    expect(privateActivationCodePath(true)).toContain('batch.is_private=eq.true');
    expect(privateActivationCodePath(false)).toContain('activation_code_batches!inner');
  });

  it('redacts only the current entitlement acquired using a private code', async () => {
    const request = vi.fn(async () => [{
      member_id: 'member-1', current_plan_id: 'plan-1',
      plan_started_at: '2026-09-01T00:00:00Z', plan_expires_at: null, is_lifetime: true,
    }]);
    const rows = [
      { id: 'member-1', currentPlanId: 'plan-1', planName: '長期訂閱', planStartedAt: '2026-09-01T00:00:00Z', planExpiresAt: null, isLifetime: true, autoRenew: false, subscriptionRevision: 3, status: 'active' },
      { id: 'member-2', currentPlanId: 'plan-2', planName: '月費', planStartedAt: null, planExpiresAt: null, isLifetime: false },
    ];
    const visible = await maskPrivateMemberEntitlements(rows, operator, { request });
    expect(visible[0]).toMatchObject({ id: 'member-1', currentPlanId: null, planName: null, planStartedAt: null, planExpiresAt: null, isLifetime: null, autoRenew: null, subscriptionRevision: null, status: 'active' });
    expect(visible[1]).toEqual(rows[1]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toContain('/rest/v1/private_activation_redemptions?');
  });

  it('does not hide a later, unrelated entitlement and never queries the owner', async () => {
    const request = vi.fn(async () => [{ member_id: 'member-1', current_plan_id: 'old', plan_started_at: null, plan_expires_at: null, is_lifetime: true }]);
    const row = { id: 'member-1', currentPlanId: 'new', planName: '月費', planStartedAt: null, planExpiresAt: null, isLifetime: false };
    expect(await maskPrivateMemberEntitlements([row], operator, { request })).toEqual([row]);
    expect(await maskPrivateMemberEntitlements([row], owner, { request })).toEqual([row]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('hides the original plan snapshot in audit records after a status update', async () => {
    const request = vi.fn(async () => [{
      member_id: 'member-1', current_plan_id: 'plan-1',
      plan_started_at: '2026-09-01T00:00:00Z', plan_expires_at: null, is_lifetime: true,
    }]);
    const rows = [{ id: 'audit-1', targetTable: 'members', targetId: 'member-1', content: '訂閱操作：lifetime',
      beforeData: { current_plan_id: 'plan-1', plan_started_at: '2026-09-01T00:00:00Z', plan_expires_at: null, is_lifetime: true },
      afterData: { current_plan_id: 'plan-1', plan_started_at: '2026-09-01T00:00:00Z', plan_expires_at: null, is_lifetime: true } }];
    const masked = await maskPrivateAuditRows(rows, operator, { request });
    expect(masked[0]).toMatchObject({ id: 'audit-1', targetId: 'member-1', content: '會員資料異動', beforeData: null, afterData: null });
    expect(await maskPrivateAuditRows(rows, owner, { request })).toEqual(rows);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('applies audit masking in the paged admin API path', async () => {
    const requestPage = vi.fn(async (_path: string) => ({ total: 1, items: [{
      id: 'audit-1', target_table: 'members', target_id: 'member-1',
      content: '訂閱操作：lifetime', before_data: { current_plan_id: 'plan-1', plan_started_at: null, plan_expires_at: null, is_lifetime: true },
      after_data: { current_plan_id: 'plan-1', plan_started_at: null, plan_expires_at: null, is_lifetime: true },
    }] }));
    const request = vi.fn(async (_path: string) => [{
      member_id: 'member-1', current_plan_id: 'plan-1', plan_started_at: null, plan_expires_at: null, is_lifetime: true,
    }]);
    const page = await listAdminTablePage('auditLogs', {}, { requestPage, request }, new Date(), operator);
    expect(page.items[0]).toMatchObject({ id: 'audit-1', content: '會員資料異動', beforeData: null, afterData: null });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('keeps private codes out of the public page and enforces the owner on the hidden page', async () => {
    const requestPage = vi.fn(async (_path: string) => ({ items: [], total: 0 }));
    const api = { request: vi.fn(async () => []), requestPage };
    await listAdminTablePage('activationCodes', { page: 1 }, api, new Date(), operator);
    expect(new URL(requestPage.mock.calls[0][0], 'https://test').searchParams.get('batch.is_private')).toBe('eq.false');
    await expect(listAdminTablePage('privateActivationCodes', {}, api, new Date(), operator))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(requestPage).toHaveBeenCalledTimes(1);
    await listAdminTablePage('privateActivationCodes', {}, api, new Date(), owner);
    expect(new URL(requestPage.mock.calls[1][0], 'https://test').searchParams.get('batch.is_private')).toBe('eq.true');
  });

  it('redacts a secret lifetime entitlement from the real member list response', async () => {
    const raw = {
      id: 'member-1', auth_user_id: null, line_user_id: null, line_display_name: '會員',
      current_plan_id: 'plan-1', current_plan: { name: '月費方案', price: 99, duration_days: 30 },
      plan_started_at: '2026-09-01T00:00:00Z', plan_expires_at: null, is_lifetime: true, status: 'active',
    };
    const requestPage = vi.fn(async (_path: string) => ({ items: [raw], total: 1 }));
    const request = vi.fn(async (path: string) => path.startsWith('/rest/v1/private_activation_redemptions')
      ? [{ member_id: 'member-1', current_plan_id: 'plan-1', plan_started_at: raw.plan_started_at, plan_expires_at: null, is_lifetime: true }]
      : []);
    const page = await listAdminMemberPage('users', { keyword: '會員' }, { request, requestPage }, new Date(), operator);
    expect(page.items[0]).toMatchObject({ id: 'member-1', memberDisplayName: '會員', isLifetime: null, currentPlanId: null, planStartedAt: null, planExpiresAt: null });
    expect(page.total).toBe(1);
    expect(new URL(requestPage.mock.calls[0][0], 'https://test').searchParams.get('keyword_plan.name')).toBeNull();
    expect(request.mock.calls.filter(([path]) => path.startsWith('/rest/v1/private_activation_redemptions'))).toHaveLength(1);
  });
});
