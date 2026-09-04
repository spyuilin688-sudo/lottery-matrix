import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: {
    getSession: vi.fn(),
    getUser: vi.fn(),
    signOut: vi.fn(),
  },
}));
vi.mock('./lib/supabase', () => ({ getSupabaseClient: () => supabase }));

import {
  bootstrapMember,
  fetchMemberReferralSummary,
  fetchMemberPaymentHistory,
  fetchMemberProfile,
  fetchNotificationSettings,
  fetchPendingTransferRequest,
  fetchPushSubscriptionStatus,
  hasAuthenticatedMemberSession,
  disablePushSubscription,
  savePushSubscription,
  saveNotificationSettings,
  submitMemberReferralCode,
  submitTransferRequest,
} from './member-api';

const settings = {
  settings: { bet: true, result: true, win: true, status: true, card: true, collision: false, system: true, expiry: true },
  selectedOptions: { result: ['今彩539'], win: ['彩種通知'], status: ['今彩539'], card: ['今彩539'], system: ['維護'], expiry: ['提前1日'] },
  betTimes: { 今彩539: ['', ''], 天天樂: ['', ''],六合彩: ['', ''], 大樂透: ['', ''] },
  statusOptions: { 今彩539: ['啟動'], 天天樂: ['啟動'],六合彩: ['啟動'], 大樂透: ['啟動'] },
  collisionOptions: { 今彩539: ['獨碰二星'], 天天樂: ['獨碰二星'],六合彩: ['獨碰二星'], 大樂透: ['獨碰二星'] },
} satisfies import('./member-api').MemberNotificationSettings;

beforeEach(() => {
  supabase.rpc.mockReset().mockResolvedValue({ data: {}, error: null });
  supabase.auth.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'token' } }, error: null });
  supabase.auth.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'current-user' } }, error: null });
  supabase.auth.signOut.mockReset().mockResolvedValue({ error: null });
});

describe('member Supabase RPC', () => {
  it('reports whether a current authenticated member session exists', async () => {
    await expect(hasAuthenticatedMemberSession()).resolves.toBe(true);
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(hasAuthenticatedMemberSession()).resolves.toBe(false);
  });
  it('bootstraps and loads only the authenticated member', async () => {
    await bootstrapMember();
    await fetchMemberProfile();

    expect(supabase.rpc.mock.calls).toEqual([
      ['member_bootstrap'],
      ['member_profile'],
    ]);
  });

  it('loads the current member referral summary and submits a referral through member-only RPCs', async () => {
    const expectedSummary = {
      referralCode: 'MATRIX-7H4K9P',
      referralSuccessCount: 3,
      hasInvitationCode: false,
      canSubmitReferralCode: true,
    };
    supabase.rpc
      .mockResolvedValueOnce({ data: expectedSummary, error: null })
      .mockResolvedValueOnce({ data: { ...expectedSummary, hasInvitationCode: true, canSubmitReferralCode: false }, error: null });

    await expect(fetchMemberReferralSummary()).resolves.toEqual(expectedSummary);
    await expect(submitMemberReferralCode('MATRIX-7H4K9P')).resolves.toEqual({
      ...expectedSummary,
      hasInvitationCode: true,
      canSubmitReferralCode: false,
    });

    expect(supabase.rpc.mock.calls).toEqual([
      ['member_referral_summary'],
      ['member_referral_submit', { p_referral_code: 'MATRIX-7H4K9P' }],
    ]);
  });

  it('retries one member RPC after an auth 401 when the auth server still validates the current user', async () => {
    const expectedSummary = {
      referralCode: 'MATRIX-7H4K9P',
      referralSuccessCount: 3,
      hasInvitationCode: false,
      canSubmitReferralCode: true,
    };
    supabase.rpc
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } })
      .mockResolvedValueOnce({ data: expectedSummary, error: null });

    await expect(fetchMemberReferralSummary()).resolves.toEqual(expectedSummary);
    expect(supabase.auth.getUser).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('clears only the stale local session when the auth server rejects the current user', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } });
    supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid Refresh Token' } });

    await expect(fetchMemberReferralSummary()).rejects.toThrow('MEMBER_SESSION_EXPIRED');
    expect(supabase.auth.getUser).toHaveBeenCalledTimes(1);
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('loads and saves normalized notification settings', async () => {
    supabase.rpc
      .mockResolvedValueOnce({ data: settings, error: null })
      .mockResolvedValueOnce({ data: settings, error: null });

    await fetchNotificationSettings();
    await saveNotificationSettings(settings);

    expect(supabase.rpc.mock.calls).toEqual([
      ['member_notification_settings_get'],
      ['member_notification_settings_save', { p_settings: settings }],
    ]);
  });

  it('surfaces RPC failures without leaking a fallback response', async () => {
    const failure = new Error('FORBIDDEN');
    supabase.rpc.mockResolvedValue({ data: null, error: failure });

    await expect(fetchMemberProfile()).rejects.toBe(failure);
  });

  it('submits and loads the authenticated member transfer records', async () => {
    await submitTransferRequest('month', '12345');
    await fetchPendingTransferRequest();
    await fetchMemberPaymentHistory();

    expect(supabase.rpc.mock.calls).toEqual([
      ['member_transfer_request_submit', { p_plan_code: 'month', p_account_last_five: '12345' }],
      ['member_pending_transfer_request'],
      ['member_payment_history_get'],
    ]);
  });

  it('loads, saves, and disables only the authenticated member push subscription', async () => {
    const subscription = {
      endpoint: 'https://push.test/device',
      p256dh: 'p256dh-value',
      auth: 'auth-value',
    };

    supabase.rpc
      .mockResolvedValueOnce({ data: { enabled: false }, error: null })
      .mockResolvedValueOnce({ data: { enabled: true }, error: null })
      .mockResolvedValueOnce({
        data: { disabled: true, endpoint: 'https://push.test/device' },
        error: null,
      });

    await fetchPushSubscriptionStatus(subscription.endpoint);
    await savePushSubscription(subscription);
    const disabled: { disabled: boolean; endpoint: string } = await disablePushSubscription(subscription.endpoint);

    expect(disabled).toEqual({ disabled: true, endpoint: 'https://push.test/device' });

    expect(supabase.rpc.mock.calls).toEqual([
      ['member_push_subscription_status', { p_endpoint: 'https://push.test/device' }],
      ['member_push_subscription_save', {
        p_endpoint: 'https://push.test/device',
        p_p256dh: 'p256dh-value',
        p_auth: 'auth-value',
      }],
      ['member_push_subscription_disable', { p_endpoint: 'https://push.test/device' }],
    ]);
  });
});
