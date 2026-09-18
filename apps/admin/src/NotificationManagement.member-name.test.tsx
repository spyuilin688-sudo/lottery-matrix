// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { NotificationManagement } from './NotificationManagement';

it('shows the member nickname instead of the provider ID in notification management', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const member = {
    userId: 'member-1',
    identityLabel: 'LINE ID' as const,
    identityValue: 'line-user-1',
    identityDisplay: 'LINE ID：line-user-1',
    displayName: 'LINE 會員暱稱',
    pictureUrl: null,
    pushEnabled: true,
  };
  const get = vi.fn(async (url: string) => ({
    data: {
      items: url === '/api/push-members'
        ? [member]
        : [{
            id: 'log-1',
            userId: member.userId,
            subscriptionId: null,
            title: '樂彩 Matrix 測試通知',
            body: '手機推播已成功啟用',
            status: 'sent' as const,
            failureReason: null,
            adminAccount: 'admin@test',
            sentAt: '2026-09-16T10:00:00.000Z',
          }],
    },
  }));
  const post = vi.fn();

  await act(async () => {
    root.render(<NotificationManagement client={{ get, post }} canEdit={true} />);
  });

  const options = Array.from(host.querySelectorAll('option')).map((option) => option.textContent);
  expect(options).toContain('LINE 會員暱稱');
  expect(host.querySelector('tbody')?.textContent).toContain('LINE 會員暱稱');
  expect(host.textContent).not.toContain('LINE ID：line-user-1');

  await act(async () => root.unmount());
  host.remove();
});
