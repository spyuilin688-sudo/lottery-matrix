// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ rpc }) }));
vi.mock('../auth/MemberSessionBridge', () => ({ MemberSessionBridge: () => null }));
vi.mock('../mobile/Device', () => ({ MobileDeviceProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock('../mobile/Keyboard', () => ({ KeyboardProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock('../dialog/AppDialog', () => ({ AppDialogProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock('../pwa-lifecycle', () => ({ PwaLifecycleProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock('../ExploreResultPreviewPage', () => ({ ExploreResultPreviewPage: () => null }));
vi.mock('../Prototype', () => ({ default: function PurchaseEntry() {
  return useSubscriptionPurchaseVisible() ? <button>訂閱方案／收費標準</button> : null;
} }));
import { useSubscriptionPurchaseVisible } from '../subscription-purchase-visibility';
import App from '../App';
afterEach(() => vi.useRealTimers());

test('App reads permission settings on mount, updates the purchase entry and stops polling on unmount', async () => {
  vi.useFakeTimers();
  let visible = true;
  let revision = 100;
  rpc.mockImplementation(async () => ({ data: {
    subscriptionPurchaseVisible: visible, registeredMemberFreeAccess: false, revision,
    updatedAt: '2026-09-09T00:00:00Z',
  }, error: null }));
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<StrictMode><App /></StrictMode>); });
  expect(screen.queryByRole('button', { name: '訂閱方案／收費標準' })).not.toBeNull();
  visible = false; revision++;
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(screen.queryByRole('button', { name: '訂閱方案／收費標準' })).toBeNull();
  view.unmount();
  const previousRequests = rpc.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); window.dispatchEvent(new Event('focus')); });
  expect(rpc.mock.calls.length).toBe(previousRequests);
});
