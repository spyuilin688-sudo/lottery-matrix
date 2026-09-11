// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationManagement } from './NotificationManagement';

const members = [
  { userId: 'member-1', displayName: '會員一', pictureUrl: 'https://line.example/one.png', pushEnabled: true },
  { userId: 'member-2', displayName: '會員二', pictureUrl: null, pushEnabled: false },
];
const failedLog = {
  id: 'log-1',
  userId: 'member-1',
  subscriptionId: 'subscription-1',
  title: '樂彩 Matrix 測試通知',
  body: '手機推播已成功啟用',
  status: 'failed' as const,
  failureReason: 'endpoint expired',
  adminAccount: 'admin@example.com',
  sentAt: '2026-08-30T10:00:00.000Z',
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function client(overrides: Partial<{
  get: (url: string) => Promise<{ data: unknown }>;
  post: (url: string, body: unknown) => Promise<{ data: unknown }>;
}> = {}) {
  return {
    get: vi.fn(async (url: string) => ({
      data: url === '/api/push-members' ? { items: members } : { items: [failedLog] },
    })),
    post: vi.fn(async () => ({ data: { sent: 1, failed: 1 } })),
    ...overrides,
  };
}

async function renderManager(apiClient = client(), canEdit = true) {
  await act(async () => {
    root.render(createElement(NotificationManagement, { client: apiClient, canEdit }));
    await Promise.resolve();
  });
  return apiClient;
}

function selector() {
  return container.querySelector('select[aria-label="選擇會員"]') as HTMLSelectElement;
}

function sendButton() {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('發送')) as HTMLButtonElement;
}

function buttonNamed(name: string) {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent === name) as HTMLButtonElement;
}

async function chooseMember(userId: string) {
  await act(async () => {
    const select = selector();
    select.value = userId;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('NotificationManagement', () => {
  it('keeps sending disabled until an active member is selected and shows the LINE profile', async () => {
    await renderManager();
    expect(sendButton().disabled).toBe(true);

    await chooseMember('member-2');
    expect(container.textContent).toContain('會員二');
    expect(container.textContent).toContain('未開啟');
    expect(sendButton().disabled).toBe(true);

    await chooseMember('member-1');
    expect(container.textContent).toContain('會員一');
    expect(container.textContent).toContain('已開啟');
    expect(container.querySelector('img[alt="會員一 的 LINE 頭貼"]')).not.toBeNull();
    expect(sendButton().disabled).toBe(false);
  });

  it('shows fixed read-only copy without custom, broadcast, or scheduling controls', async () => {
    await renderManager();

    expect(container.textContent).toContain('樂彩 Matrix 測試通知');
    expect(container.textContent).toContain('手機推播已成功啟用');
    expect(container.querySelector('input, textarea')).toBeNull();
    expect(container.textContent).not.toMatch(/全體|群發|排程/);
  });

  it('reports send counts, blocks duplicate sends, and shows time, result, and failure reason', async () => {
    let release!: () => void;
    const post = vi.fn(() => new Promise<{ data: { sent: number; failed: number } }>((resolve) => {
      release = () => resolve({ data: { sent: 1, failed: 1 } });
    }));
    await renderManager(client({ post }));
    await chooseMember('member-1');
    const button = sendButton();

    act(() => {
      button.click();
      button.click();
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(selector().disabled).toBe(true);
    await act(async () => { release(); });

    expect(container.textContent).toContain('發送完成：成功 1，失敗 1');
    expect(container.textContent).toContain('失敗');
    expect(container.textContent).toContain('endpoint expired');
    expect(container.textContent).toContain('2026/08/30 18:00');
  });

  it('revalidates members and logs after a 200 response and keeps an expired member disabled', async () => {
    let memberRequest = 0;
    let logRequest = 0;
    const get = vi.fn(async (url: string) => {
      if (url === '/api/push-members') {
        memberRequest += 1;
        return { data: { items: memberRequest === 1 ? members : [{ ...members[0], pushEnabled: false }, members[1]] } };
      }
      logRequest += 1;
      return { data: { items: [failedLog] } };
    });
    await renderManager(client({ get, post: vi.fn(async () => ({ data: { sent: 0, failed: 1 } })) }));
    await chooseMember('member-1');

    await act(async () => { sendButton().click(); });

    expect(memberRequest).toBe(2);
    expect(logRequest).toBe(2);
    expect(container.textContent).toContain('發送完成：成功 0，失敗 1');
    expect(container.textContent).toContain('未開啟');
    expect(sendButton().disabled).toBe(true);
  });

  it('ignores an older delivery-log response after a successful send refresh', async () => {
    let releaseOld!: (value: { data: { items: Array<typeof failedLog> } }) => void;
    const oldLogs = new Promise<{ data: { items: Array<typeof failedLog> } }>((resolve) => { releaseOld = resolve; });
    let logRequest = 0;
    const get = vi.fn(async (url: string) => {
      if (url === '/api/push-members') return { data: { items: members } };
      logRequest += 1;
      if (logRequest === 1) return oldLogs;
      return { data: { items: [{ ...failedLog, id: 'fresh-log', failureReason: 'fresh reason' }] } };
    });
    act(() => {
      root.render(createElement(NotificationManagement, { client: client({ get }), canEdit: true }));
    });
    await act(async () => { await Promise.resolve(); });

    await chooseMember('member-1');
    await act(async () => { sendButton().click(); });
    expect(container.textContent).toContain('fresh reason');

    await act(async () => { releaseOld({ data: { items: [{ ...failedLog, id: 'old-log', failureReason: 'stale reason' }] } }); });
    expect(container.textContent).not.toContain('stale reason');
    expect(container.textContent).toContain('fresh reason');
  });

  it('re-enables sending after server confirmation without waiting for the log refresh', async () => {
    const pendingRefresh = new Promise<{ data: { items: Array<typeof failedLog> } }>(() => undefined);
    let logRequest = 0;
    const get = vi.fn(async (url: string) => {
      if (url === '/api/push-members') return { data: { items: members } };
      logRequest += 1;
      return logRequest === 1 ? { data: { items: [failedLog] } } : pendingRefresh;
    });
    await renderManager(client({ get }));
    await chooseMember('member-1');

    await act(async () => { sendButton().click(); });

    expect(container.textContent).toContain('發送完成：成功 1，失敗 1');
    expect(sendButton().getAttribute('aria-busy')).toBe('false');
    expect(sendButton().disabled).toBe(false);
  });

  it.each([
    [400, 'INVALID_MEMBER_ID', '會員資料無效，請重新選擇會員'],
    [409, 'NO_ACTIVE_SUBSCRIPTIONS', '此會員目前沒有有效的推播訂閱'],
    [503, 'UNAVAILABLE', '發送失敗，請稍後再試'],
  ])('shows fixed copy for a production HTTP %i error envelope', async (_status, code, expected) => {
    const post = vi.fn(async () => {
      throw { error: { code, message: `private ${code} detail` } };
    });
    await renderManager(client({ post }));
    await chooseMember('member-1');

    await act(async () => { sendButton().click(); });

    expect(container.textContent).toContain(expected);
    expect(container.textContent).not.toContain(`private ${code} detail`);
    if (code === 'NO_ACTIVE_SUBSCRIPTIONS') {
      expect(container.textContent).toContain('未開啟');
      expect(sendButton().disabled).toBe(true);
    }
  });

  it('recovers an initial member-list failure through one explicit retry', async () => {
    let memberRequest = 0;
    const get = vi.fn(async (url: string) => {
      if (url !== '/api/push-members') return { data: { items: [failedLog] } };
      memberRequest += 1;
      if (memberRequest === 1) throw new Error('offline');
      return { data: { items: members } };
    });
    await renderManager(client({ get }));

    expect(container.textContent).toContain('會員列表讀取失敗');
    const retry = buttonNamed('重新讀取會員');
    expect(retry).toBeTruthy();
    await act(async () => {
      retry.click();
      retry.click();
    });

    expect(memberRequest).toBe(2);
    expect(selector().options).toHaveLength(3);
  });

  it('keeps stale logs visible after a refresh failure and recovers with retry', async () => {
    let logRequest = 0;
    const freshLog = { ...failedLog, id: 'log-2', failureReason: 'recovered reason' };
    const get = vi.fn(async (url: string) => {
      if (url === '/api/push-members') return { data: { items: members } };
      logRequest += 1;
      if (logRequest === 1) return { data: { items: [failedLog] } };
      if (logRequest === 2) throw new Error('refresh failed');
      return { data: { items: [freshLog] } };
    });
    await renderManager(client({ get }));
    await chooseMember('member-1');

    await act(async () => { sendButton().click(); });

    expect(container.textContent).toContain('發送紀錄更新失敗');
    expect(container.textContent).toContain('endpoint expired');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    await act(async () => { buttonNamed('重新讀取紀錄').click(); });
    expect(container.textContent).toContain('recovered reason');
    expect(container.textContent).not.toContain('發送紀錄更新失敗');
  });

  it('renders delivery logs five per page in one semantic responsive table', async () => {
    const manyLogs = Array.from({ length: 200 }, (_, index) => ({
      ...failedLog,
      id: `log-${index}`,
      failureReason: `reason-${index}`,
    }));
    const get = vi.fn(async (url: string) => ({
      data: { items: url === '/api/push-members' ? members : manyLogs },
    }));
    await renderManager(client({ get }));

    expect(container.textContent).toContain('最新 200 筆紀錄');
    expect(container.querySelectorAll('tbody tr, .notificationLogCard')).toHaveLength(5);
    expect(container.textContent).toContain('第 1／40 頁');
    expect(container.textContent).toContain('reason-4');
    expect(container.textContent).not.toContain('reason-5');
    await act(async () => { buttonNamed('下一頁').click(); });
    expect(container.textContent).toContain('第 2／40 頁');
    expect(container.textContent).toContain('reason-5');
    expect(container.textContent).not.toContain('reason-4');
    expect(container.querySelector('table[aria-label="測試推播發送紀錄"]')).not.toBeNull();
    expect(container.querySelector('.notificationLogCards')).toBeNull();
  });
});
