// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const memberApi = vi.hoisted(() => ({
  fetchMemberProfile: vi.fn(),
  fetchPendingTransferRequest: vi.fn(),
  fetchMemberPaymentHistory: vi.fn(),
  submitTransferRequest: vi.fn(),
}));
const selection = vi.hoisted(() => ({
  readManualTransferPlan: vi.fn(),
  saveManualTransferPlan: vi.fn(),
}));
vi.mock('../member-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../member-api')>(),
  ...memberApi,
}));
vi.mock('../manual-transfer-selection', () => selection);
vi.mock('../dialog/AppDialog', () => ({
  useAppDialog: () => ({ confirm: vi.fn().mockResolvedValue(true), alert: vi.fn() }),
}));

import { ManualTransferPage, PaymentHistoryPage, ProPlansPage } from '../FeaturePages';
import { SubscriptionManagementPage } from '../features/MemberPages';
import { getSupabaseClient } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { updateAlgorithmCacheSession } from '../auth/algorithm-cache-scope';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const pendingTransfer = { id: 'pending-1', planName: '月費方案', amount: 2880,
  accountLastFive: '54321', submittedAt: '2026-08-30T08:00:00Z', status: 'pending' };
const switchMember = (member: string) => updateAlgorithmCacheSession({ access_token: member, user: { id: member } } as Session);

function authenticatePaymentHistory() {
  const auth = getSupabaseClient().auth;
  vi.spyOn(auth, 'getSession').mockResolvedValue({
    data: { session: { access_token: 'payment-member', user: { id: 'payment-member' } } as Session },
    error: null,
  });
  vi.spyOn(auth, 'onAuthStateChange').mockReturnValue({
    data: { subscription: { id: 'payment-fixture', callback: () => undefined, unsubscribe: vi.fn() } },
  });
}

describe('Matrix Pro manual bank transfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    switchMember('member-a');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-07T00:00:00Z'));
    memberApi.fetchMemberProfile.mockResolvedValue({
      lineUserId: 'member', planName: '年費方案',
      planExpiresAt: '2027-11-04T23:20:01.683Z', isLifetime: false,
    });
    selection.readManualTransferPlan.mockReturnValue('month');
    memberApi.fetchPendingTransferRequest.mockResolvedValue(null);
    memberApi.fetchMemberPaymentHistory.mockResolvedValue([]);
    memberApi.submitTransferRequest.mockResolvedValue({
      id: 'transfer-1', planName: '月費方案', amount: 2880,
      accountLastFive: '12345', submittedAt: '2026-08-30T08:00:00Z', status: 'pending',
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('shows actual member information in subscription management', async () => {
    render(<SubscriptionManagementPage onNavigate={vi.fn()} />);
    expect(await screen.findByText('2027/11/05')).toBeInTheDocument();
    expect(screen.getByText('年費方案')).toBeInTheDocument();
    expect(screen.queryByText('2027/07/23')).not.toBeInTheDocument();
  });

  it('replaces subscription data on account change and ignores the previous member response', async () => {
    const old = deferred<unknown>();
    memberApi.fetchMemberProfile.mockReturnValueOnce(old.promise).mockResolvedValue({ planName: 'new-member-plan', isLifetime: false });
    render(<SubscriptionManagementPage onNavigate={vi.fn()} />);
    act(() => switchMember('member-b'));
    await screen.findByText('new-member-plan');
    await act(async () => old.resolve({ planName: 'old-member-plan', isLifetime: false }));
    expect(screen.queryByText('old-member-plan')).not.toBeInTheDocument();
    expect(screen.getByText('new-member-plan')).toBeInTheDocument();
  });

  it('shows lifetime membership without a fabricated expiry', async () => {
    memberApi.fetchMemberProfile.mockResolvedValue({ planName: null, planExpiresAt: null, isLifetime: true });
    render(<SubscriptionManagementPage onNavigate={vi.fn()} />);
    expect(await screen.findByText('永久會員')).toBeInTheDocument();
    expect(screen.getByText('無到期日')).toBeInTheDocument();
  });

  it('previews renewal from the actual future member expiry in Taipei time', async () => {
    render(<ProPlansPage onNavigate={vi.fn()} />);
    expect(await screen.findByText('2027/12/05')).toBeInTheDocument();
    expect(screen.queryByText('2027/08/22')).not.toBeInTheDocument();
  });

  it.each([[2, '2028/02/03'], [3, '2028/11/04']])(
    'updates the renewal preview when the carousel selects position %s', async (position, expectedDate) => {
      render(<ProPlansPage onNavigate={vi.fn()} />);
      await screen.findByText('2027/12/05');
      const carousel = screen.getByLabelText('Matrix Pro 會員方案');
      Object.defineProperty(carousel, 'clientWidth', { configurable: true, value: 100 });
      Object.defineProperty(carousel, 'scrollLeft', { configurable: true, value: Number(position) * 100 });
      Array.from(carousel.children).forEach((card, index) => {
        Object.defineProperty(card, 'offsetLeft', { configurable: true, value: index * 100 });
        Object.defineProperty(card, 'clientWidth', { configurable: true, value: 100 });
      });
      fireEvent.scroll(carousel);
      expect(await screen.findByText(String(expectedDate))).toBeInTheDocument();
    },
  );

  it('does not fabricate dates while membership is loading or when its expiry is invalid', async () => {
    let resolveProfile!: (value: unknown) => void;
    memberApi.fetchMemberProfile.mockReturnValue(new Promise((resolve) => { resolveProfile = resolve; }));
    render(<ProPlansPage onNavigate={vi.fn()} />);
    expect(screen.getByText('讀取中')).toBeInTheDocument();
    resolveProfile({ planExpiresAt: 'invalid-date', isLifetime: false });
    expect(await screen.findByText('暫時無法計算')).toBeInTheDocument();
  });

  it.each([null, '2026-01-01T00:00:00Z'])(
    'previews 30 days from today for missing or expired membership (%s)', async (planExpiresAt) => {
      memberApi.fetchMemberProfile.mockResolvedValue({ planExpiresAt, isLifetime: false });
      render(<ProPlansPage onNavigate={vi.fn()} />);
      expect(await screen.findByText('2026/10/07')).toBeInTheDocument();
    },
  );

  it('does not invent a renewal date when profile loading fails', async () => {
    memberApi.fetchMemberProfile.mockRejectedValue(new Error('network unavailable'));
    render(<ProPlansPage onNavigate={vi.fn()} />);
    expect(await screen.findByText('暫時無法計算')).toBeInTheDocument();
    expect(screen.queryByText('2027/08/22')).not.toBeInTheDocument();
  });

  it('opens transfer reporting after plan payment confirmation', async () => {
    const onNavigate = vi.fn();
    render(<ProPlansPage onNavigate={onNavigate} />);

    expect(screen.queryByRole('heading', { name: '轉帳資料' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '確定付款' })).toHaveClass('primary-action', 'branded-explore-action');
    expect(screen.getByRole('checkbox', { name: '自動續訂' })).toBeDisabled();
    expect(screen.getByText(/手動轉帳不會自動扣款/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '確定付款' }));

    await waitFor(() => expect(selection.saveManualTransferPlan).toHaveBeenCalledWith('month'));
    expect(onNavigate).toHaveBeenCalledWith('manual-transfer');
  });

  it('omits bank details and account copying while allowing transfer reporting', async () => {
    render(<ManualTransferPage onNavigate={vi.fn()} />);

    expect(await screen.findByText('NT$2,880')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '轉帳資料' })).not.toBeInTheDocument();
    expect(document.querySelector('.manual-transfer-bank-card')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '複製帳號' })).not.toBeInTheDocument();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12a3456' } });
    expect(screen.getByLabelText('帳號末五碼')).toHaveValue('12345');
    fireEvent.click(screen.getByRole('button', { name: '提交' }));

    await waitFor(() => expect(memberApi.submitTransferRequest).toHaveBeenCalledWith('month', '12345'));
    expect(await screen.findByText('待確認')).toBeInTheDocument();
  });

  it('blocks another submission while one request is pending', async () => {
    memberApi.fetchPendingTransferRequest.mockResolvedValue({
      id: 'pending-1', planName: '月費方案', amount: 2880,
      accountLastFive: '54321', submittedAt: '2026-08-30T08:00:00Z', status: 'pending',
    });
    render(<ManualTransferPage onNavigate={vi.fn()} />);

    expect(await screen.findByText('已有待確認申請')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交' })).toBeDisabled();
  });

  it('does not refetch pending transfers merely because the navigation callback changes', async () => {
    const old = deferred<unknown>();
    memberApi.fetchPendingTransferRequest.mockReturnValueOnce(old.promise);
    const view = render(<ManualTransferPage onNavigate={vi.fn()} />);
    view.rerender(<ManualTransferPage onNavigate={vi.fn()} />);
    expect(memberApi.fetchPendingTransferRequest).toHaveBeenCalledTimes(1);
    await act(async () => old.resolve(pendingTransfer));
    expect(screen.getByText('已有待確認申請')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交' })).toBeDisabled();
  });

  it.each(['success', 'failure'] as const)('ignores a previous member pending-transfer read %s', async outcome => {
    const old = deferred<unknown>();
    memberApi.fetchPendingTransferRequest.mockReturnValueOnce(old.promise).mockResolvedValue(pendingTransfer);
    render(<ManualTransferPage onNavigate={vi.fn()} />);
    act(() => switchMember('member-b'));
    await screen.findByText('已有待確認申請');
    await act(async () => outcome === 'success' ? old.resolve(null) : old.reject(new Error('old-member-offline')));
    expect(screen.getByText('已有待確認申請')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交' })).toBeDisabled();
  });

  it('discards previous member transfer submission results and clears their draft on account change', async () => {
    const oldSubmit = deferred<unknown>();
    memberApi.submitTransferRequest.mockReturnValueOnce(oldSubmit.promise);
    render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    act(() => switchMember('member-b'));
    await waitFor(() => expect(memberApi.fetchPendingTransferRequest).toHaveBeenCalledTimes(2));
    await act(async () => oldSubmit.resolve(pendingTransfer));
    expect(screen.getByLabelText('帳號末五碼')).toHaveValue('');
    expect(screen.queryByText('已有待確認申請')).not.toBeInTheDocument();
  });

  it('does not start recovery reads after an old submission reports an existing transfer for another member', async () => {
    const oldSubmit = deferred<unknown>();
    memberApi.submitTransferRequest.mockReturnValueOnce(oldSubmit.promise);
    render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    act(() => switchMember('member-b'));
    await waitFor(() => expect(memberApi.fetchPendingTransferRequest).toHaveBeenCalledTimes(2));
    await act(async () => oldSubmit.reject(new Error('PENDING_TRANSFER_EXISTS')));
    expect(memberApi.fetchPendingTransferRequest).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a recoverable error when reloading an existing pending transfer fails', async () => {
    memberApi.fetchPendingTransferRequest.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('offline'));
    memberApi.submitTransferRequest.mockRejectedValueOnce(new Error('PENDING_TRANSFER_EXISTS'));
    render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('無法讀取轉帳申請，請稍後再試。');
    expect(screen.getByRole('button', { name: '提交' })).toBeEnabled();
  });

  it('returns to plans without exposing bank data when no plan was selected', async () => {
    selection.readManualTransferPlan.mockReturnValue(null);
    const onNavigate = vi.fn();
    render(<ManualTransferPage onNavigate={onNavigate} />);

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('pro-plans'));
    expect(screen.queryByRole('heading', { name: '轉帳資料' })).not.toBeInTheDocument();
  });

  it('renders authenticated member payment history', async () => {
    authenticatePaymentHistory();
    memberApi.fetchMemberPaymentHistory.mockResolvedValue([{
      id: 'payment-1', planName: '季費方案', amount: 4580,
      submittedAt: '2026-08-30T08:00:00Z', status: 'confirmed',
    }]);
    render(<PaymentHistoryPage onNavigate={vi.fn()} />);

    expect(document.querySelector('.payment-history-screen')).toBeInTheDocument();
    expect(await screen.findByText('季費方案')).toBeInTheDocument();
    expect(screen.getByText('NT$4,580')).toBeInTheDocument();
    expect(screen.getByText('已確認')).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it('prefers completed payment reversal statuses in member payment history', async () => {
    authenticatePaymentHistory();
    memberApi.fetchMemberPaymentHistory.mockResolvedValue([
      { id: 'payment-1', planName: '月費方案', amount: 2880, submittedAt: '2026-09-01T00:00:00Z', status: 'refunded' },
      { id: 'payment-2', planName: '季費方案', amount: 4580, submittedAt: '2026-09-02T00:00:00Z', status: 'chargeback' },
      { id: 'payment-3', planName: '年費方案', amount: 12880, submittedAt: '2026-09-03T00:00:00Z', status: 'cancelled' },
    ]);

    render(<PaymentHistoryPage onNavigate={vi.fn()} />);

    expect(await screen.findByText('已退款')).toBeInTheDocument();
    expect(screen.getByText('已刷退')).toBeInTheDocument();
    expect(screen.getByText('交易已取消')).toBeInTheDocument();
  });
});
