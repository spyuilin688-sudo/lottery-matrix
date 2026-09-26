// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { UserInfoDialog } from './UserInfoDialog';

it('shows the existing account, connection, online, and subscription fields without exposing internal member ids', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const client = { get: vi.fn(async () => ({ data: { items: [], hasMore: false } })) };
  await act(async () => root.render(<UserInfoDialog module="subscriptions" row={{
    id: 'member-internal-id', memberDisplayName: 'Google 會員', identityLabel: 'Google ID', identityValue: 'google-123',
    registeredAt: '2026-08-01T00:00:00Z', lastOnlineAt: '2026-09-16T08:00:00Z', status: 'active', recentOnlineMinutes: 37,
    recentIp: '203.0.113.1', estimatedRegion: '台灣・台北市', planName: '季費',
    planStartedAt: '2026-09-01T00:00:00Z', planExpiresAt: '2026-12-01T00:00:00Z', isLifetime: false, autoRenew: true,
  }} client={client} onClose={() => {}} />));
  const text = host.textContent ?? '';
  for (const expected of ['會員名稱', 'Google 會員', 'Google ID', 'google-123', '帳號狀態', '啟用', '近3日在線時間', '37 分鐘', '最近連線IP', '203.0.113.1', '推估地區', '台灣・台北市', '訂閱方案', '季費', '方案開始時間', '方案到期時間', '自動續訂', '是']) expect(text).toContain(expected);
  expect(text).not.toContain('會員ID');
  expect(text).not.toContain('驗證用戶ID');
  expect(text).not.toContain('member-internal-id');
  await act(async () => root.unmount()); host.remove();
});

it('shows unknown renewal state for a redacted subscription', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const client = { get: vi.fn(async () => ({ data: { items: [], hasMore: false } })) };
  await act(async () => root.render(<UserInfoDialog module="subscriptions" row={{
    id: 'member-2', memberDisplayName: '一般會員', autoRenew: null,
    planName: null, planStartedAt: null, planExpiresAt: null, isLifetime: null,
  }} client={client} onClose={() => {}} />));
  const renewal = [...host.querySelectorAll('dt')].find((field) => field.textContent === '自動續訂');
  expect(renewal?.nextElementSibling?.textContent).toBe('—');
  await act(async () => root.unmount()); host.remove();
});
