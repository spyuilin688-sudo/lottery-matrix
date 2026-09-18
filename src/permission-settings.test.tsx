// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('./lib/supabase', () => ({ getSupabaseClient: () => ({
  rpc, auth: { getSession: async () => ({ data: { session: { user: { id: 'member' }, access_token: 'token' } }, error: null }) },
}) }));
import { refreshPermissionSettings } from './permission-settings';
import { useSubscriptionPurchaseVisible } from './subscription-purchase-visibility';
import { fetchTianyanList } from './matrix-algorithm-api';
import { getMatrixDataRevision } from './matrix-data-revision';
const state = (revision: number, visible = false) => ({ data: {
  subscriptionPurchaseVisible: visible, registeredMemberFreeAccess: true, revision, updatedAt: '2026-09-09T00:00:00Z',
}, error: null });
beforeEach(async () => {
  rpc.mockReset().mockRejectedValue(new Error('offline'));
  await refreshPermissionSettings().catch(() => {});
  rpc.mockReset();
});
test('purchase visibility updates without remounting and fails closed when settings cannot be read', async () => {
  function Entry() { return useSubscriptionPurchaseVisible() ? <button>訂閱購買</button> : null; }
  render(<Entry />);
  expect(screen.queryByRole('button')).toBeNull();
  rpc.mockResolvedValue(state(10, true));
  await act(async () => { await refreshPermissionSettings(); });
  expect(screen.getByRole('button', { name: '訂閱購買' })).toBeTruthy();
  rpc.mockResolvedValue(state(11));
  await act(async () => { await refreshPermissionSettings(); });
  expect(screen.queryByRole('button')).toBeNull();
  rpc.mockResolvedValue(state(12, true));
  await act(async () => { await refreshPermissionSettings(); });
  rpc.mockRejectedValue(new Error('offline'));
  await act(async () => { await refreshPermissionSettings().catch(() => {}); });
  expect(screen.queryByRole('button')).toBeNull();
});
test('late responses cannot restore an older setting revision', async () => {
  let resolve!: (value: ReturnType<typeof state>) => void;
  rpc.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const pending = refreshPermissionSettings();
  rpc.mockResolvedValue(state(20));
  await refreshPermissionSettings();
  resolve(state(19, true));
  expect((await pending).subscriptionPurchaseVisible).toBe(false);
});
test('closing free access invalidates protected cache and the next RPC denial reaches the caller', async () => {
  let revision = 30;
  let allowed = true;
  rpc.mockImplementation(async (name: string) => name === 'matrix_permission_settings'
    ? { ...state(revision), data: { ...state(revision).data, registeredMemberFreeAccess: allowed } }
    : allowed ? { data: { lottery: '今彩539', items: [] }, error: null } : { data: null, error: { code: '42501', message: 'FORBIDDEN' } });
  const request = { lottery: '今彩539' as const, selectedStreaks: ['準4進5'], sameCode: false };
  await fetchTianyanList(request);
  await fetchTianyanList(request);
  expect(rpc.mock.calls.filter(([name]) => name === 'matrix_tianyan_list')).toHaveLength(1);
  const oldRevision = getMatrixDataRevision();
  allowed = false; revision++;
  await expect(fetchTianyanList(request)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(getMatrixDataRevision()).toBeGreaterThan(oldRevision);
  expect(rpc.mock.calls.filter(([name]) => name === 'matrix_tianyan_list')).toHaveLength(2);
});
