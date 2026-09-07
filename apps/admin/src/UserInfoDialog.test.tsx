// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { UserInfoDialog } from './UserInfoDialog';

it('shows four profile fields and loads five login records per page', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const get = vi.fn(async (url: string) => ({ data: { items: url.includes('page=2') ? [] : Array.from({ length: 5 }, (_, i) => ({ id: String(i), loginAt: '2026-09-07T04:00:00Z', ip: '203.0.113.1', region: '台灣・台北市' })), hasMore: !url.includes('page=2') } }));
  await act(async () => root.render(<UserInfoDialog row={{ id: 'member-1', lineDisplayName: '會員', authUserId: 'auth-1' }} client={{ get }} onClose={() => {}} />));
  expect(host.querySelectorAll('.memberInfoCard')).toHaveLength(2);
  expect(host.querySelectorAll('dl > div')).toHaveLength(4);
  expect(host.querySelectorAll('tbody tr')).toHaveLength(5);
  const next = Array.from(host.querySelectorAll('button')).find(x => x.textContent === '下一頁')!;
  await act(async () => next.click());
  expect(get).toHaveBeenLastCalledWith('/api/members/member-1/login-records?module=users&page=2');
  expect(host.textContent).toContain('目前沒有登入紀錄');
  await act(async () => root.unmount()); host.remove();
});

it('shows a retryable error and uses subscription permissions for that entry', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const get = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue({ data: { items: [], hasMore: false } });
  await act(async () => root.render(<UserInfoDialog row={{ id: 'm' }} module="subscriptions" client={{ get }} onClose={() => {}} />));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('無法載入');
  await act(async () => Array.from(host.querySelectorAll('button')).find(x => x.textContent === '重試')!.click());
  expect(get).toHaveBeenLastCalledWith('/api/members/m/login-records?module=subscriptions&page=1');
  expect(host.textContent).toContain('目前沒有登入紀錄');
  await act(async () => root.unmount()); host.remove();
});
