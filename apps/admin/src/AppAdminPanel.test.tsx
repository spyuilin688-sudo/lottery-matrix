// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppAdminPanel } from './AppAdminPanel';
const client = { get: vi.fn(), put: vi.fn() };
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const page = (name: string) => ({ data: { items: [{ id: 'a', displayName: name, status: 'active', entitlementRevision: 1, entitlementSource: 'free_launch' }], total: 1, page: 1, pageSize: 25 } });
it('ignores a late response from another App page', async () => {
  let resolve!: (value: unknown) => void;
  client.get.mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValueOnce({ data: { transactionCount: 0, totalsByCurrency: [] } });
  const view = render(<AppAdminPanel page="users" client={client} />);
  view.rerender(<AppAdminPanel page="revenue" client={client} />);
  await screen.findByText('目前沒有 App 收入紀錄。');
  await act(async () => resolve(page('遲到會員')));
  expect(screen.queryByText('遲到會員')).toBeNull();
});
it('reports failure and retries without showing a fake zero', async () => {
  client.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: { transactionCount: 0, totalsByCurrency: [] } });
  render(<AppAdminPanel page="revenue" client={client} />);
  await screen.findByRole('alert');
  expect(screen.queryByText('目前沒有 App 收入紀錄。')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '重新載入' }));
  await screen.findByText('目前沒有 App 收入紀錄。');
});
it('changes only the selected App member with its observed revision', async () => {
  client.get.mockResolvedValue(page('App 會員'));
  client.put.mockResolvedValue({ data: {} });
  render(<AppAdminPanel page="users" client={client} />);
  fireEvent.click(await screen.findByRole('button', { name: '停用' }));
  fireEvent.click(screen.getByRole('button', { name: '確認停用' }));
  await screen.findByText('App 會員');
  expect(client.put).toHaveBeenCalledWith('/api/app/users/a/status', { status: 'disabled', expectedRevision: 1 });
});
