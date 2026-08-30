import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./lib/supabase', () => ({ getSupabaseClient: () => supabase }));

import {
  bootstrapMember,
  fetchMemberPaymentHistory,
  fetchMemberProfile,
  fetchNotificationSettings,
  fetchPendingTransferRequest,
  saveNotificationSettings,
  submitTransferRequest,
} from './member-api';

const settings = {
  settings: { bet: true, result: true, win: true, status: true, card: true, collision: false, system: true, expiry: true },
  selectedOptions: { result: ['今彩539'], win: ['彩種通知'], status: ['今彩539'], card: ['今彩539'], system: ['維護'], expiry: ['提前1日'] },
  betTimes: { 今彩539: ['', ''], 天天樂: ['', ''], 六合彩: ['', ''], 大樂透: ['', ''] },
  statusOptions: { 今彩539: ['啟動'], 天天樂: ['啟動'], 六合彩: ['啟動'], 大樂透: ['啟動'] },
  collisionOptions: { 今彩539: ['獨碰二星'], 天天樂: ['獨碰二星'], 六合彩: ['獨碰二星'], 大樂透: ['獨碰二星'] },
} satisfies import('./member-api').MemberNotificationSettings;

beforeEach(() => {
  supabase.rpc.mockReset().mockResolvedValue({ data: {}, error: null });
});

describe('member Supabase RPC', () => {
  it('bootstraps and loads only the authenticated member', async () => {
    await bootstrapMember();
    await fetchMemberProfile();

    expect(supabase.rpc.mock.calls).toEqual([
      ['member_bootstrap'],
      ['member_profile'],
    ]);
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
});
