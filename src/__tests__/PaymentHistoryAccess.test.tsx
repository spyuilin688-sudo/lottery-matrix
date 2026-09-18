// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { render } from '../../test/render-with-dialog';
import type { MemberPaymentHistoryItem } from '../member-api';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  listeners: new Set<(event: AuthChangeEvent, session: Session | null) => void>(),
}));
const fetchHistory = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ auth }) }));
vi.mock('../member-api', async (original) => ({
  ...(await original<typeof import('../member-api')>()),
  fetchMemberPaymentHistory: fetchHistory,
}));
vi.mock('../subscription-purchase-visibility', () => ({ useSubscriptionPurchaseVisible: () => true }));

import { FeaturePageRouter } from '../FeaturePagesPatched';

function session(userId: string): Session {
  return {
    access_token: `access-${userId}`, refresh_token: `refresh-${userId}`,
    token_type: 'bearer', expires_in: 3600,
    user: { id: userId, aud: 'authenticated', role: 'authenticated',
      app_metadata: { provider: 'custom:line' }, user_metadata: {},
      created_at: '2026-09-01T00:00:00Z', is_anonymous: false },
  };
}
const alice = session('alice');
const bob = session('bob');
const payment: MemberPaymentHistoryItem = {
  id: 'payment-alice', planName: '季費方案', amount: 5580,
  submittedAt: '2026-09-12T00:00:00Z', status: 'confirmed',
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function emit(event: AuthChangeEvent, value: Session | null) {
  auth.getSession.mockResolvedValue({ data: { session: value }, error: null });
  act(() => { for (const listener of auth.listeners) listener(event, value); });
}
function showPage() {
  const onNavigate = vi.fn();
  const view = render(<FeaturePageRouter screen="payment-history" onNavigate={onNavigate} />);
  return { ...view, onNavigate };
}
beforeEach(() => {
  vi.resetAllMocks();
  auth.listeners.clear();
  auth.getSession.mockResolvedValue({ data: { session: alice }, error: null });
  auth.onAuthStateChange.mockImplementation((listener) => {
    auth.listeners.add(listener);
    return { data: { subscription: { unsubscribe: () => auth.listeners.delete(listener) } } };
  });
  fetchHistory.mockResolvedValue([]);
});
afterEach(cleanup);

describe('payment history access and recovery', () => {
  it('shows a guest login action without querying private payment records', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { onNavigate } = showPage();
    fireEvent.click(await screen.findByRole('button', { name: '前往登入' }));
    expect(screen.getByText('請先登入，即可查看付款紀錄。')).toBeInTheDocument();
    expect(onNavigate).toHaveBeenCalledWith('profile');
    expect(fetchHistory).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('目前沒有付款紀錄。')).not.toBeInTheDocument();
  });

  it('waits for the initial session check before loading payment records', async () => {
    const pending = deferred<{ data: { session: Session }; error: null }>();
    auth.getSession.mockReturnValue(pending.promise);
    showPage();
    expect(screen.getByRole('status')).toHaveTextContent('登入狀態確認中');
    expect(fetchHistory).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ data: { session: alice }, error: null }));
    expect(await screen.findByText('目前沒有付款紀錄。')).toBeInTheDocument();
    expect(fetchHistory).toHaveBeenCalledTimes(1);
  });

  it('shows the authenticated empty state only after a successful query', async () => {
    showPage();
    expect(await screen.findByText('目前沒有付款紀錄。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '前往登入' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a genuine query failure recoverable and displays successful retry data', async () => {
    fetchHistory.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([payment]);
    showPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('付款紀錄載入失敗');
    expect(screen.queryByText('目前沒有付款紀錄。')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新載入付款紀錄' }));
    expect(await screen.findByText('季費方案')).toBeInTheDocument();
    expect(screen.getByText('NT$5,580')).toBeInTheDocument();
    expect(screen.getByText('已確認')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('distinguishes an unknown session from a confirmed guest and allows retry', async () => {
    auth.getSession.mockRejectedValueOnce(new Error('auth unavailable'));
    showPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('登入狀態確認失敗');
    expect(fetchHistory).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '前往登入' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新確認登入狀態' }));
    expect(await screen.findByText('目前沒有付款紀錄。')).toBeInTheDocument();
  });

  it('ignores a late initial session read after a sign-out event', async () => {
    const pending = deferred<{ data: { session: Session }; error: null }>();
    auth.getSession.mockReturnValue(pending.promise);
    showPage();
    emit('SIGNED_OUT', null);
    await act(async () => pending.resolve({ data: { session: alice }, error: null }));
    expect(await screen.findByRole('button', { name: '前往登入' })).toBeInTheDocument();
    expect(fetchHistory).not.toHaveBeenCalled();
  });

  it('discards in-flight records when the member signs out', async () => {
    const pending = deferred<MemberPaymentHistoryItem[]>();
    fetchHistory.mockReturnValue(pending.promise);
    showPage();
    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1));
    emit('SIGNED_OUT', null);
    await act(async () => pending.resolve([payment]));
    expect(await screen.findByRole('button', { name: '前往登入' })).toBeInTheDocument();
    expect(screen.queryByText('季費方案')).not.toBeInTheDocument();
  });

  it('clears already visible records immediately on sign-out', async () => {
    fetchHistory.mockResolvedValue([payment]);
    showPage();
    await screen.findByText('季費方案');
    emit('SIGNED_OUT', null);
    expect(screen.queryByText('季費方案')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '前往登入' })).toBeInTheDocument();
  });

  it('does not show the previous account response after switching members', async () => {
    const first = deferred<MemberPaymentHistoryItem[]>();
    const second = deferred<MemberPaymentHistoryItem[]>();
    fetchHistory.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    showPage();
    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1));
    emit('SIGNED_IN', bob);
    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(2));
    await act(async () => first.resolve([payment]));
    expect(screen.queryByText('季費方案')).not.toBeInTheDocument();
    await act(async () => second.resolve([{ ...payment, id: 'payment-bob', planName: '月費方案', amount: 2880 }]));
    expect(await screen.findByText('月費方案')).toBeInTheDocument();
    expect(screen.getByText('NT$2,880')).toBeInTheDocument();
  });

  it('does not refetch or flash a loaded history on token refresh', async () => {
    fetchHistory.mockResolvedValue([payment]);
    showPage();
    await screen.findByText('季費方案');
    emit('TOKEN_REFRESHED', { ...alice, access_token: 'refreshed-alice' });
    expect(screen.getByText('季費方案')).toBeInTheDocument();
    expect(fetchHistory).toHaveBeenCalledTimes(1);
  });

  it('does not restore a signed-out member from a delayed token refresh', async () => {
    showPage();
    await screen.findByText('目前沒有付款紀錄。');
    emit('SIGNED_OUT', null);
    emit('TOKEN_REFRESHED', alice);
    expect(screen.getByRole('button', { name: '前往登入' })).toBeInTheDocument();
    expect(fetchHistory).toHaveBeenCalledTimes(1);
  });

  it('offers login when the payment API confirms that the member session expired', async () => {
    fetchHistory.mockRejectedValue(new Error('MEMBER_SESSION_EXPIRED'));
    showPage();
    expect(await screen.findByRole('button', { name: '前往登入' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
