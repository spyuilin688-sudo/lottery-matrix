// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
const ecpay = vi.hoisted(() => ({ beginEcpayCheckout: vi.fn() }));
vi.mock('../member-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../member-api')>(),
  ...memberApi,
}));
vi.mock('../manual-transfer-selection', async (importOriginal) => ({
  ...await importOriginal<typeof import('../manual-transfer-selection')>(),
  ...selection,
}));
vi.mock('../ecpay-checkout', () => ecpay);
vi.mock('../dialog/AppDialog', () => ({
  useAppDialog: () => ({ confirm: vi.fn().mockResolvedValue(true), alert: vi.fn() }),
}));

import { ManualTransferPage, PaymentHistoryPage, ProPlansPage } from '../FeaturePages';
import { SubscriptionManagementPage } from '../features/MemberPages';
import type { Session } from '@supabase/supabase-js';
import { updateAlgorithmCacheSession } from '../auth/algorithm-cache-scope';
import { publishMemberSessionReady } from '../auth/member-session-store';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const pendingTransfer = { id: 'pending-1', planName: '月費方案', amount: 2880,
  accountLastFive: '54321', submittedAt: '2026-08-30T08:00:00Z', status: 'pending' };
const switchMember = (member: string) => {
  const session = { access_token: member, user: { id: member } } as Session;
  updateAlgorithmCacheSession(session);
  publishMemberSessionReady(session);
};

function authenticatePaymentHistory() {
  publishMemberSessionReady({ access_token: 'payment-member', user: { id: 'payment-member' } } as Session);
}

describe('Matrix Pro manual bank transfer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.sessionStorage.clear();
    switchMember('member-a');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-07T00:00:00Z'));
    memberApi.fetchMemberProfile.mockResolvedValue({
      lineUserId: 'member', planName: '月費方案',
      planExpiresAt: '2027-11-04T23:20:01.683Z', isLifetime: false,
    });
    selection.readManualTransferPlan.mockReturnValue('month');
    memberApi.fetchPendingTransferRequest.mockResolvedValue(null);
    memberApi.fetchMemberPaymentHistory.mockResolvedValue([]);
    memberApi.submitTransferRequest.mockImplementation(async (_plan, _lastFive, requestId) => ({
      id: requestId, planName: '月費方案', amount: 2880,
      accountLastFive: '12345', submittedAt: '2026-08-30T08:00:00Z', status: 'pending',
    }));
    ecpay.beginEcpayCheckout.mockResolvedValue('submitted');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('shows actual member information in subscription management', async () => {
    memberApi.fetchMemberProfile.mockResolvedValueOnce({
      lineUserId: 'member', planName: '年費方案',
      planExpiresAt: '2027-11-04T23:20:01.683Z', isLifetime: false,
    });
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

  it('starts one-time Green World checkout without entering manual transfer', async () => {
    const onNavigate = vi.fn();
    render(<ProPlansPage onNavigate={onNavigate} />);

    expect(screen.queryByRole('heading', { name: '轉帳資料' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '確定付款' })).toHaveClass('primary-action', 'branded-explore-action');
    expect(screen.getByRole('checkbox', { name: '自動續訂' })).toBeDisabled();
    expect(screen.queryByText(/自動續訂未開放/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '確定付款' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '確定付款' }));
    await waitFor(() => expect(ecpay.beginEcpayCheckout).toHaveBeenCalledExactlyOnceWith('month', { isCurrent: expect.any(Function) }));
    expect(selection.saveManualTransferPlan).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalledWith('manual-transfer');
  });

  it('retains manual transfer after the operator switches away from Green World', async () => {
    ecpay.beginEcpayCheckout.mockResolvedValue('manual');
    const onNavigate = vi.fn();
    render(<ProPlansPage onNavigate={onNavigate} />);
    await waitFor(() => expect(screen.getByRole('button', { name: '確定付款' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '確定付款' }));
    await waitFor(() => expect(selection.saveManualTransferPlan).toHaveBeenCalledWith('month'));
    expect(onNavigate).toHaveBeenCalledWith('manual-transfer');
  });

  it('shows an error without redirecting or creating a manual transfer on checkout failure', async () => {
    ecpay.beginEcpayCheckout.mockRejectedValue(new Error('network'));
    const onNavigate = vi.fn();
    render(<ProPlansPage onNavigate={onNavigate} />);
    await waitFor(() => expect(screen.getByRole('button', { name: '確定付款' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '確定付款' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('無法開啟付款頁面，請稍後再試。');
    expect(screen.getByRole('button', { name: '確定付款' })).toBeEnabled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('keeps one checkout in flight across leaving and re-entering the plans page', async () => {
    const oldCheckout = deferred<'manual'>();
    ecpay.beginEcpayCheckout.mockReturnValueOnce(oldCheckout.promise).mockResolvedValue('manual');
    const oldNavigate = vi.fn();
    const first = render(<ProPlansPage onNavigate={oldNavigate} />);
    await waitFor(() => expect(screen.getByRole('button', { name: '確定付款' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '確定付款' }));
    await waitFor(() => expect(ecpay.beginEcpayCheckout).toHaveBeenCalledTimes(1));
    first.unmount();

    const newNavigate = vi.fn();
    render(<ProPlansPage onNavigate={newNavigate} />);
    expect(screen.getByRole('button', { name: '正在開啟付款頁面…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '正在開啟付款頁面…' }));
    expect(ecpay.beginEcpayCheckout).toHaveBeenCalledTimes(1);
    await act(async () => oldCheckout.resolve('manual'));
    expect(oldNavigate).not.toHaveBeenCalledWith('manual-transfer');
    expect(selection.saveManualTransferPlan).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '確定付款' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '確定付款' }));
    await waitFor(() => expect(ecpay.beginEcpayCheckout).toHaveBeenCalledTimes(2));
  });

  it.each([
    ['month', '月費方案', 'NT$2,880'],
    ['quarter', '季費方案', 'NT$5,580'],
    ['year', '年費方案', 'NT$17,800'],
  ])('shows the approved receiving account for the selected %s plan', async (code, name, amount) => {
    selection.readManualTransferPlan.mockReturnValue(code);
    render(<ManualTransferPage onNavigate={vi.fn()} />);

    expect(await screen.findByText(amount)).toBeInTheDocument();
    expect(screen.getByText(name)).toBeInTheDocument();
    const bank = screen.getByRole('region', { name: '轉帳資料' });
    for (const [label, value] of [
      ['收款銀行', '連線銀行'],
      ['銀行代碼', '824'],
      ['收款帳號', '111023004501'],
      ['戶名', '黎小姐'],
    ]) {
      const term = within(bank).getByText(label, { selector: 'dt' });
      expect(term.nextElementSibling).toHaveTextContent(new RegExp(`^${value}$`));
    }
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    expect(memberApi.submitTransferRequest).not.toHaveBeenCalled();
    expect(ecpay.beginEcpayCheckout).not.toHaveBeenCalled();
  });

  it('keeps reporting the payer account last five separately from the receiving account', async () => {
    render(<ManualTransferPage onNavigate={vi.fn()} />);

    expect(await screen.findByText('NT$2,880')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '複製帳號' })).not.toBeInTheDocument();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12a3456' } });
    expect(screen.getByLabelText('帳號末五碼')).toHaveValue('12345');
    fireEvent.click(screen.getByRole('button', { name: '提交' }));

    await waitFor(() => expect(memberApi.submitTransferRequest).toHaveBeenCalledWith('month', '12345', expect.any(String)));
    expect(await screen.findByText('待確認')).toBeInTheDocument();
  });

  it('shows a paid membership restriction and prevents manual transfer submission', async () => {
    memberApi.fetchMemberProfile.mockResolvedValueOnce({
      lineUserId: 'member', planName: '年費方案',
      planExpiresAt: '2027-11-04T23:20:01.683Z', isLifetime: false,
    });
    render(<ManualTransferPage onNavigate={vi.fn()} />);
    expect(await screen.findByText(/有效的年費方案無法購買較低方案/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '轉帳資料' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('帳號末五碼')).toBeDisabled();
    expect(screen.getByRole('button', { name: '提交' })).toBeDisabled();
    expect(memberApi.submitTransferRequest).not.toHaveBeenCalled();
  });

  it('withholds receiving details until an eligible member profile is confirmed', async () => {
    const profile = deferred<unknown>();
    memberApi.fetchMemberProfile.mockReturnValue(profile.promise);
    render(<ManualTransferPage onNavigate={vi.fn()} />);

    expect(screen.getByText('正在讀取會員資料，請稍候。')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '轉帳資料' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交' })).toBeDisabled();

    await act(async () => profile.resolve({ planName: '月費方案', planExpiresAt: null, isLifetime: false }));
    expect(screen.getByRole('region', { name: '轉帳資料' })).toBeInTheDocument();
  });

  it('withholds receiving details if the member profile fails to load', async () => {
    memberApi.fetchMemberProfile.mockRejectedValue(new Error('member profile unavailable'));
    render(<ManualTransferPage onNavigate={vi.fn()} />);

    expect(await screen.findByText('會員資料載入失敗，請稍後重新開啟方案頁。')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '轉帳資料' })).not.toBeInTheDocument();
  });

  it('keeps an existing pending request visible even if a new purchase is blocked', async () => {
    memberApi.fetchMemberProfile.mockResolvedValue({ planName: null, planExpiresAt: null, isLifetime: true });
    memberApi.fetchPendingTransferRequest.mockResolvedValue(pendingTransfer);
    render(<ManualTransferPage onNavigate={vi.fn()} />);

    expect(await screen.findByText('已有待確認申請')).toBeInTheDocument();
    expect(screen.getByText('NT$2,880')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '轉帳資料' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交' })).toBeDisabled();
  });

  it('keeps a rejected retry result visible without offering receiving details for a blocked member', async () => {
    memberApi.fetchPendingTransferRequest.mockResolvedValue(null);
    memberApi.submitTransferRequest.mockRejectedValueOnce(new Error('response lost'));
    const first = render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('尚未確認提交結果');
    const requestId = memberApi.submitTransferRequest.mock.calls[0][2];
    first.unmount();

    memberApi.fetchMemberProfile.mockResolvedValue({ planName: null, planExpiresAt: null, isLifetime: true });
    memberApi.submitTransferRequest.mockResolvedValueOnce({ ...pendingTransfer, id: requestId, status: 'rejected' });
    render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    expect(screen.queryByRole('region', { name: '轉帳資料' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新確認申請' }));

    expect(await screen.findByText('申請已退回')).toBeInTheDocument();
    expect(screen.getByText('已退回')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '轉帳資料' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交' })).toBeDisabled();
    expect(memberApi.submitTransferRequest.mock.calls[1][2]).toBe(requestId);
  });

  it('labels paid but unfulfilled orders as needing refund in member history', async () => {
    authenticatePaymentHistory();
    memberApi.fetchMemberPaymentHistory.mockResolvedValue([{
      id: 'payment-refund', planName: '月費方案', amount: 2880,
      submittedAt: '2026-09-07T00:00:00Z', status: 'refund_required',
    }]);
    render(<PaymentHistoryPage onNavigate={vi.fn()} />);
    expect(await screen.findByText('需退款處理')).toBeInTheDocument();
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

  it.each([[2880, 'NT$2,880'], [2580, 'NT$2,580']])(
    'shows the existing request plan and recorded amount %s after another plan was selected', async (amount, expectedAmount) => {
      selection.readManualTransferPlan.mockReturnValue('year');
      memberApi.fetchPendingTransferRequest.mockResolvedValue({ ...pendingTransfer, amount });
      render(<ManualTransferPage onNavigate={vi.fn()} />);

      await screen.findByText('已有待確認申請');
      expect(screen.getByText('月費方案')).toBeInTheDocument();
      expect(screen.getByText(String(expectedAmount))).toBeInTheDocument();
      expect(screen.queryByText('年費方案')).not.toBeInTheDocument();
      expect(screen.queryByText('NT$17,800')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '提交' })).toBeDisabled();
    },
  );

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
    expect(screen.getByRole('button', { name: '重新確認申請' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重新載入申請狀態' })).toBeEnabled();
  });

  it('blocks submission until a failed pending read is retried successfully', async () => {
    memberApi.fetchPendingTransferRequest.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(null);
    render(<ManualTransferPage onNavigate={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('無法讀取轉帳申請');
    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12345' } });
    expect(screen.getByRole('button', { name: '提交' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '重新載入申請狀態' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '提交' })).toBeEnabled());
  });

  it('reconciles a transport-uncertain submission before offering another submit', async () => {
    memberApi.fetchPendingTransferRequest.mockResolvedValueOnce(null).mockResolvedValueOnce(pendingTransfer);
    memberApi.submitTransferRequest.mockRejectedValueOnce(new Error('offline'));
    render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(await screen.findByText('已有待確認申請')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新確認申請' })).toBeDisabled();
    expect(memberApi.submitTransferRequest).toHaveBeenCalledTimes(1);
  });

  it('retries a lost response with the same request ID after a terminal review and shows its final status', async () => {
    memberApi.fetchPendingTransferRequest.mockResolvedValue(null);
    memberApi.submitTransferRequest.mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (_plan, _lastFive, requestId) => ({ ...pendingTransfer, id: requestId, status: 'confirmed' }));
    const first = render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('尚未確認提交結果');
    expect(screen.getByLabelText('帳號末五碼')).toHaveValue('12345');
    expect(screen.getByLabelText('帳號末五碼')).toBeDisabled();
    expect(screen.getByRole('button', { name: '重新確認申請' })).toBeEnabled();
    const firstId = memberApi.submitTransferRequest.mock.calls[0][2];
    first.unmount();

    const second = render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    expect(screen.getByLabelText('帳號末五碼')).toHaveValue('12345');
    expect(screen.getByLabelText('帳號末五碼')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '重新確認申請' }));
    expect(await screen.findByText('已確認')).toBeInTheDocument();
    expect(memberApi.submitTransferRequest.mock.calls[1][2]).toBe(firstId);
    expect(screen.queryByText('已有待確認申請')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交' })).toBeDisabled();
    expect(screen.getByLabelText('帳號末五碼')).toBeDisabled();
    second.unmount();
  });

  it('replays a locked request even when the member becomes lifetime before retry', async () => {
    memberApi.fetchPendingTransferRequest.mockResolvedValue(null);
    memberApi.submitTransferRequest.mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (_plan, _lastFive, requestId) => ({ ...pendingTransfer, id: requestId, status: 'confirmed' }));
    const first = render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    await screen.findByRole('alert');
    const firstId = memberApi.submitTransferRequest.mock.calls[0][2];
    first.unmount();

    memberApi.fetchMemberProfile.mockResolvedValue({ planName: '終身方案', isLifetime: true });
    render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    expect(screen.getByLabelText('帳號末五碼')).toHaveValue('12345');
    expect(screen.getByRole('button', { name: '重新確認申請' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '重新確認申請' }));
    expect(await screen.findByText('申請已確認')).toBeInTheDocument();
    expect(memberApi.submitTransferRequest.mock.calls[1][2]).toBe(firstId);
  });

  it('resolves a lost response when the pending read matches its request ID', async () => {
    memberApi.fetchPendingTransferRequest.mockResolvedValueOnce(null).mockImplementationOnce(async () => ({
      ...pendingTransfer, id: memberApi.submitTransferRequest.mock.calls[0][2],
    }));
    memberApi.submitTransferRequest.mockRejectedValueOnce(new Error('offline'));
    const first = render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(await screen.findByText('已有待確認申請')).toBeInTheDocument();
    const firstId = memberApi.submitTransferRequest.mock.calls[0][2];
    first.unmount();

    render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    expect(screen.getByLabelText('帳號末五碼')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    await waitFor(() => expect(memberApi.submitTransferRequest).toHaveBeenCalledTimes(2));
    expect(memberApi.submitTransferRequest.mock.calls[1][2]).not.toBe(firstId);
  });

  it('does not call the transfer RPC if the retry ID cannot be saved', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    setItem.mockImplementation((key) => {
      if (key.startsWith('matrix-manual-transfer-attempt:')) throw new Error('storage unavailable');
    });
    render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('無法儲存申請狀態');
    expect(memberApi.submitTransferRequest).not.toHaveBeenCalled();
  });

  it('releases a definitively blocked plan so the member can choose a valid plan', async () => {
    memberApi.fetchPendingTransferRequest.mockResolvedValue(null);
    memberApi.submitTransferRequest.mockRejectedValueOnce({
      code: 'P0001', message: 'PLAN_DOWNGRADE_BLOCKED', details: null, hint: null,
    });
    const first = render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('無法購買較低方案');
    expect(screen.queryByRole('region', { name: '轉帳資料' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交' })).toBeDisabled();
    first.unmount();

    selection.readManualTransferPlan.mockReturnValue('year');
    render(<ManualTransferPage onNavigate={vi.fn()} />);
    expect(screen.getByText('年費方案')).toBeInTheDocument();
    expect(screen.getByLabelText('帳號末五碼')).toHaveValue('');
  });

  it('does not retain a rejected attempt after a different pending transfer is reviewed', async () => {
    memberApi.fetchPendingTransferRequest.mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pendingTransfer).mockResolvedValue(null);
    memberApi.submitTransferRequest.mockRejectedValueOnce({
      code: '23505', message: 'PENDING_TRANSFER_EXISTS', details: null, hint: null,
    });
    const first = render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    await screen.findByText('已有待確認申請');
    const rejectedId = memberApi.submitTransferRequest.mock.calls[0][2];
    expect(rejectedId).not.toBe(pendingTransfer.id);
    first.unmount();

    // The other request has been reviewed, so the pending-only read is now empty.
    render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重新確認申請' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('帳號末五碼')).toHaveValue('');
    expect(screen.getByLabelText('帳號末五碼')).toBeEnabled();
    expect(screen.getByRole('button', { name: '提交' })).toBeDisabled();
    expect(memberApi.submitTransferRequest).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '54321' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    await screen.findByText('已有待確認申請');
    expect(memberApi.submitTransferRequest.mock.calls[1]).toEqual(['month', '54321', expect.any(String)]);
    expect(memberApi.submitTransferRequest.mock.calls[1][2]).not.toBe(rejectedId);
  });

  it('does not misclassify a rejected attempt when the other transfer is reviewed before reconciliation', async () => {
    memberApi.fetchPendingTransferRequest.mockResolvedValue(null);
    memberApi.submitTransferRequest.mockRejectedValueOnce({
      code: '23505', message: 'PENDING_TRANSFER_EXISTS', details: null, hint: null,
    });
    render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    await waitFor(() => expect(memberApi.fetchPendingTransferRequest).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: '提交' })).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('帳號末五碼')).toBeEnabled();
    expect(memberApi.submitTransferRequest).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['empty response', null],
    ['another request', { ...pendingTransfer, id: 'another-request' }],
    ['unknown status', { ...pendingTransfer, status: 'unknown' }],
  ])('keeps the same UUID after a successful HTTP response with %s', async (_case, result) => {
    memberApi.fetchPendingTransferRequest.mockResolvedValue(null);
    memberApi.submitTransferRequest.mockImplementationOnce(async (_plan, _lastFive, requestId) => (
      _case === 'unknown status' ? { ...pendingTransfer, id: requestId, status: 'unknown' } : result
    ))
      .mockImplementationOnce(async (_plan, _lastFive, requestId) => ({ ...pendingTransfer, id: requestId, status: 'confirmed' }));
    const first = render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('尚未確認提交結果');
    const firstId = memberApi.submitTransferRequest.mock.calls[0][2];
    first.unmount();

    render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    expect(screen.getByLabelText('帳號末五碼')).toHaveValue('12345');
    fireEvent.click(screen.getByRole('button', { name: '重新確認申請' }));
    expect(await screen.findByText('申請已確認')).toBeInTheDocument();
    expect(memberApi.submitTransferRequest.mock.calls[1][2]).toBe(firstId);
  });

  it('keeps the original request after an auth rejection whose commit status is uncertain', async () => {
    memberApi.fetchPendingTransferRequest.mockResolvedValue(null);
    memberApi.submitTransferRequest.mockRejectedValueOnce({ code: '42501', message: 'FORBIDDEN', details: null, hint: null });
    const first = render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('尚未確認提交結果');
    const requestId = memberApi.submitTransferRequest.mock.calls[0][2];
    first.unmount();

    const profile = deferred<unknown>();
    memberApi.fetchMemberProfile.mockReturnValueOnce(profile.promise);
    render(<ManualTransferPage onNavigate={vi.fn()} />);
    expect(screen.queryByRole('region', { name: '轉帳資料' })).not.toBeInTheDocument();
    await act(async () => profile.resolve({ planName: '月費方案', planExpiresAt: null, isLifetime: false }));
    expect(screen.getByRole('region', { name: '轉帳資料' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    expect(screen.getByLabelText('帳號末五碼')).toHaveValue('12345');
    fireEvent.click(screen.getByRole('button', { name: '重新確認申請' }));
    await waitFor(() => expect(memberApi.submitTransferRequest).toHaveBeenCalledTimes(2));
    expect(memberApi.submitTransferRequest.mock.calls[1][2]).toBe(requestId);
  });

  it('starts a fresh request for a new payer account after an acknowledged prior result', async () => {
    memberApi.fetchPendingTransferRequest.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    memberApi.submitTransferRequest.mockImplementation(async (_plan, _lastFive, requestId) => ({ ...pendingTransfer, id: requestId }));
    render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(await screen.findByText('已有待確認申請')).toBeInTheDocument();
    cleanup();
    render(<ManualTransferPage onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText('申請狀態載入中')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '54321' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    await waitFor(() => expect(memberApi.submitTransferRequest).toHaveBeenCalledTimes(2));
    expect(memberApi.submitTransferRequest.mock.calls[1][2]).not.toBe(memberApi.submitTransferRequest.mock.calls[0][2]);
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

    expect(document.querySelector('.payment-ledger-screen')).toBeInTheDocument();
    expect(await screen.findByText('季費方案')).toBeInTheDocument();
    expect(screen.getByText('NT$4,580')).toBeInTheDocument();
    expect(screen.getByText('✓ 已確認')).toBeInTheDocument();
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
