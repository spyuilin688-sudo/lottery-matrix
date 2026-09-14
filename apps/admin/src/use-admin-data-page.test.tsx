// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAdminDataPage } from './use-admin-data-page';

afterEach(cleanup);
const response = (id: string, currentPage = 1, total = 301) => ({ data: { items: [{ id }], total, currentPage, totalPages: 11 } });
function deferred() {
  let resolve!: (value: ReturnType<typeof response>) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<ReturnType<typeof response>>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

it('uses server counts and sends page, filters and stable ordering without slicing the returned page', async () => {
  const client = { get: vi.fn().mockResolvedValue(response('oldest-result', 2)) };
  const { result } = renderHook(() => useAdminDataPage('activationCodes', 0, client, 'admin-1'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.total).toBe(301);
  expect(result.current.currentPage).toBe(2);
  expect(result.current.items).toEqual([{ id: 'oldest-result' }]);
  act(() => result.current.setPage(3));
  await waitFor(() => expect(client.get).toHaveBeenLastCalledWith(expect.stringContaining('page=3&')));
  act(() => result.current.setQuery({ keyword: 'old member', status: 'used', startDate: '2026-09-01', endDate: '2026-09-02', sortBy: 'code', sortDirection: 'asc' }));
  expect(result.current.items).toEqual([]);
  await waitFor(() => expect(client.get).toHaveBeenLastCalledWith('/api/data/activationCodes?page=1&keyword=old+member&status=used&startDate=2026-09-01&endDate=2026-09-02&sortBy=code&sortDirection=asc'));
});

it.each(['resolve', 'reject'] as const)('ignores an old %s while a newer page is loading and after it succeeds', async outcome => {
  const old = deferred(); const next = deferred();
  const client = { get: vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise) };
  const { result } = renderHook(() => useAdminDataPage('auditLogs', 0, client, 'admin-1'));
  await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));
  act(() => result.current.setPage(2));
  await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
  await act(async () => { if (outcome === 'resolve') old.resolve(response('old')); else old.reject(new Error('old failure')); });
  expect(result.current.loading).toBe(true);
  expect(result.current.error).toBe('');
  expect(result.current.items).toEqual([]);
  await act(async () => next.resolve(response('new', 2)));
  expect(result.current.items[0].id).toBe('new');
  expect(result.current.loading).toBe(false);
});

it('invalidates old sessions and unmounts, clears failed rows and supports explicit refresh', async () => {
  const old = deferred();
  const client = { get: vi.fn().mockReturnValueOnce(old.promise).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response('recovered')) };
  const { result, rerender, unmount } = renderHook(({ session }) => useAdminDataPage('admins', 0, client, session), { initialProps: { session: 'old-admin' } });
  await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));
  const staleRefresh = result.current.refresh;
  rerender({ session: 'new-admin' });
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.items).toEqual([]);
  await act(async () => old.resolve(response('old-admin-private-data')));
  expect(result.current.items).toEqual([]);
  await act(async () => result.current.refresh());
  expect(result.current.items[0].id).toBe('recovered');
  await expect(staleRefresh()).rejects.toThrow('列表重新載入已取消');
  expect(result.current.items[0].id).toBe('recovered');
  expect(result.current.loading).toBe(false);
  const last = deferred(); client.get.mockReturnValueOnce(last.promise);
  let refresh!: Promise<void>;
  act(() => { refresh = result.current.refresh(); });
  const assertion = expect(refresh).rejects.toThrow('列表重新載入已取消');
  unmount();
  last.resolve(response('unmounted'));
  await assertion;
});
