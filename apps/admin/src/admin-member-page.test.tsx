// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { useAdminMemberPage } from './use-admin-member-page';
const response = (id: string, total = 61, currentPage = 1) => ({ data: { items: [{ id, lineDisplayName: id, currentPlanId: 'plan-monthly', planName: '月費方案' }], total, currentPage, totalPages: Math.max(1, Math.ceil(total / 30)) } });

test('page and search are sent to server; stale results never replace a newer filter', async () => {
  let finishOld!: (value: ReturnType<typeof response>) => void;
  const client = { get: vi.fn().mockResolvedValueOnce(response('page1')).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockResolvedValueOnce(response('search-result', 1)) };
  const { result } = renderHook(() => useAdminMemberPage('users', 0, client));
  await waitFor(() => expect(result.current.paged.items[0]?.id).toBe('page1'));
  expect(result.current.total).toBe(61);
  act(() => result.current.setPage(2));
  await waitFor(() => expect(client.get).toHaveBeenCalledWith('/api/data/users?page=2&keyword=&status=all'));
  act(() => result.current.setKeyword('舊會員'));
  expect(result.current.paged.items).toEqual([]);
  await waitFor(() => expect(result.current.paged.items[0]?.id).toBe('search-result'));
  expect(client.get).toHaveBeenLastCalledWith('/api/data/users?page=1&keyword=%E8%88%8A%E6%9C%83%E5%93%A1&status=all');
  await act(async () => finishOld(response('stale-page2', 61, 2)));
  expect(result.current.paged.items[0]?.id).toBe('search-result');
});

test('failed reads clear actionable rows and explicit retry recovers', async () => {
  const client = { get: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response('recovered', 1)) };
  const { result } = renderHook(() => useAdminMemberPage('subscriptions', 0, client));
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.paged.items).toEqual([]);
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.paged.items[0]?.id).toBe('recovered'));
  expect(result.current.error).toBe('');
});

test('status changes reset page and a mutation refresh preserves the selected filter', async () => {
  const client = { get: vi.fn().mockResolvedValue(response('member')) };
  const { result, rerender } = renderHook(({ revision }) => useAdminMemberPage('users', revision, client), { initialProps: { revision: 0 } });
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => { result.current.setPage(3); });
  act(() => { result.current.setStatus('disabled'); });
  await waitFor(() => expect(client.get).toHaveBeenLastCalledWith('/api/data/users?page=1&keyword=&status=disabled'));
  rerender({ revision: 1 });
  await waitFor(() => expect(client.get.mock.calls.filter(([url]) => url.endsWith('status=disabled')).length).toBe(2));
});
