// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { AdminTransferPush } from './AdminTransferPush';
import { enableTransferPush, currentTransferPush, disableTransferPush, type TransferPushApi } from './admin-transfer-push';
let client: TransferPushApi;
let subscription: PushSubscription;
let registration: ServiceWorkerRegistration;
let permission: ReturnType<typeof vi.fn>;
let root: Root | undefined;
let container: HTMLDivElement;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  subscription = { endpoint: 'https://push.example/device', toJSON: () => ({ endpoint: 'https://push.example/device', keys: { p256dh: 'key', auth: 'auth' } }) } as PushSubscription;
  registration = { active: {}, pushManager: { getSubscription: vi.fn(async () => null), subscribe: vi.fn(async () => subscription) } } as unknown as ServiceWorkerRegistration;
  permission = vi.fn(async () => 'granted');
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: permission }); vi.stubGlobal('PushManager', {}); vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: vi.fn(async () => registration), getRegistration: vi.fn(async () => registration) } });
  client = { get: vi.fn(async () => ({ data: { publicKey: 'AQID', enabled: false } })), post: vi.fn(async () => ({ data: { enabled: true } })), delete: vi.fn(async () => ({ data: { enabled: false } })) };
  container = document.createElement('div'); document.body.append(container);
});
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; container.remove(); vi.unstubAllGlobals(); });
async function render(isSuper = true) { root = createRoot(container); await act(async () => root?.render(<AdminTransferPush client={client} isSuper={isSuper} />)); }
async function click() { await act(async () => container.querySelector('button')?.click()); }
it('requests permission synchronously before network and persists before success', async () => {
  const promise = enableTransferPush(client); expect(permission).toHaveBeenCalledOnce(); expect(client.get).not.toHaveBeenCalled(); await promise;
  expect(client.post).toHaveBeenCalledWith('/api/admin-transfer-push', { subscription: subscription.toJSON() });
  expect(navigator.serviceWorker.register).toHaveBeenCalledWith(expect.stringContaining('/admin-push-sw.js'), { scope: '/' });
});
it('does not register or save denied permission', async () => {
  permission.mockResolvedValue('denied'); await expect(enableTransferPush(client)).rejects.toThrow('通知權限已封鎖'); expect(client.get).not.toHaveBeenCalled(); expect(navigator.serviceWorker.register).not.toHaveBeenCalled();
});
it('requires server acknowledgement', async () => { vi.mocked(client.post).mockResolvedValue({ data: { enabled: false } }); await expect(enableTransferPush(client)).rejects.toThrow('尚未儲存'); });
it('checks current owner on server rather than trusting browser permission', async () => {
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission: permission }); vi.mocked(registration.pushManager.getSubscription).mockResolvedValue(subscription);
  expect((await currentTransferPush(client)).enabled).toBe(false); expect(client.get).toHaveBeenCalledWith('/api/admin-transfer-push?endpoint=https%3A%2F%2Fpush.example%2Fdevice');
});
it('disables server enrollment and surfaces failure', async () => {
  await disableTransferPush(client, subscription); expect(client.delete).toHaveBeenCalledWith('/api/admin-transfer-push', { data: { endpoint: subscription.endpoint } });
  vi.mocked(client.delete).mockRejectedValue(new Error('offline')); await expect(disableTransferPush(client, subscription)).rejects.toThrow('offline');
});
it('sends the disable endpoint in the Axios DELETE request body', async () => {
  let sentBody: unknown;
  client.delete = vi.fn(async (_url, config) => {
    // The deployed SDK exports an Axios instance; DELETE reads config.data.
    sentBody = (config as { data?: unknown } | undefined)?.data;
    if (!sentBody) throw new Error('Request failed with status code 400');
    return { data: { enabled: false } };
  });
  await disableTransferPush(client, subscription);
  expect(sentBody).toEqual({ endpoint: subscription.endpoint });
});
it('hides controls and performs no requests for non-superadmins', async () => { await render(false); expect(container.textContent).toBe(''); expect(client.get).not.toHaveBeenCalled(); });
it('does not prompt on mount and enables/disables with truthful feedback', async () => {
  await render(); expect(permission).not.toHaveBeenCalled(); await click(); expect(container.textContent).toContain('已啟用此裝置的新轉帳通知'); await click(); expect(container.textContent).toContain('已停用此裝置的新轉帳通知');
});
it('retains enabled state on disable failure', async () => {
  await render(); await click(); vi.mocked(client.delete).mockRejectedValue(new Error('離線，請重試')); await click(); expect(container.querySelector('[role=alert]')?.textContent).toContain('離線'); expect(container.querySelector('button')?.textContent).toBe('停用此裝置通知');
});
it('provides installation instructions on iOS outside standalone', async () => {
  const original = navigator.userAgent; Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone' });
  try { await render(); expect(container.textContent).toContain('加入主畫面'); expect(container.querySelector('button')?.disabled).toBe(true); expect(client.get).not.toHaveBeenCalled(); }
  finally { Object.defineProperty(navigator, 'userAgent', { configurable: true, value: original }); }
});
it('worker ignores payload navigation/data and opens fixed same-origin admin URL', async () => {
  const listeners: Record<string, (event: any) => void> = {};
  const showNotification = vi.fn(async () => {}); const openWindow = vi.fn(async () => {});
  const worker = { addEventListener: (type: string, handler: (event: any) => void) => { listeners[type] = handler; }, registration: { scope: 'https://admin.example/backoffice/', showNotification }, clients: { matchAll: async () => [{ url: 'https://evil.example/backoffice/', navigate: vi.fn(), focus: vi.fn() }], openWindow } };
  vm.runInNewContext(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../public/admin-push-sw.js'), 'utf8'), { self: worker, URL });
  let done: Promise<unknown> | undefined;
  listeners.push({ data: { json: () => ({ url: 'https://evil.example', body: 'private financial information' }) }, waitUntil: (value: Promise<unknown>) => { done = value; } }); await done;
  expect(showNotification).toHaveBeenCalledWith('新轉帳申請', expect.objectContaining({ body: '有新的轉帳申請待處理，請登入後台查看。' }));
  listeners.notificationclick({ notification: { close: vi.fn(), data: { url: 'https://evil.example' } }, waitUntil: (value: Promise<unknown>) => { done = value; } }); await done;
  expect(openWindow).toHaveBeenCalledWith('https://admin.example/backoffice/#transfer-requests');
});
