export const TRANSFER_PUSH_API = '/api/admin-transfer-push';
export type TransferPushApi = {
  get(url: string): Promise<{ data: { publicKey?: string; enabled?: boolean } }>;
  post(url: string, body: unknown): Promise<{ data: { enabled?: boolean } }>;
  delete(url: string, config?: { data: { endpoint: string } }): Promise<{ data: { enabled?: boolean } }>;
};

export function pushAvailability(): string {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
  if (ios && !standalone) return '請先將此後台加入主畫面，再從主畫面開啟以啟用手機通知。';
  if (!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return '此瀏覽器目前不支援推播通知，請使用支援推播的瀏覽器開啟後台。';
  return '';
}

export function adminAppUrl() { return new URL('./', window.location.href); }

async function registration() {
  const base = adminAppUrl();
  const registered = await navigator.serviceWorker.register(new URL('admin-push-sw.js', base).href, { scope: base.pathname });
  if (registered.active) return registered;
  // Wait for this worker's activation, not an unrelated worker's global ready promise.
  const worker = registered.installing || registered.waiting;
  if (!worker) throw new Error('通知服務尚未就緒，請稍後重試。');
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error('通知服務啟動逾時，請重試。')), 15000);
    const finish = (error?: Error) => { window.clearTimeout(timeout); worker.removeEventListener('statechange', check); error ? reject(error) : resolve(); };
    const check = () => { if (worker.state === 'activated') finish(); else if (worker.state === 'redundant') finish(new Error('通知服務啟動失敗，請重試。')); };
    worker.addEventListener('statechange', check);
    check();
  });
  return registered;
}

export async function currentTransferPush(client: TransferPushApi) {
  const registered = await navigator.serviceWorker.getRegistration(adminAppUrl().href);
  const subscription = await registered?.pushManager.getSubscription();
  const response = await client.get(TRANSFER_PUSH_API + (subscription ? `?endpoint=${encodeURIComponent(subscription.endpoint)}` : ''));
  return { subscription: subscription ?? null, enabled: Boolean(subscription && Notification.permission === 'granted' && response.data.enabled) };
}

export async function enableTransferPush(client: TransferPushApi) {
  const unavailable = pushAvailability();
  if (unavailable) throw new Error(unavailable);
  // Must be invoked synchronously from the click handler before any network/worker await (iOS).
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? '通知權限已封鎖，請先在瀏覽器或系統設定中允許通知。' : '尚未允許通知，您可以再試一次。');
  const config = await client.get(TRANSFER_PUSH_API);
  if (!config.data.publicKey) throw new Error('通知服務尚未設定完成，請稍後重試。');
  const encoded = config.data.publicKey.replace(/-/g, '+').replace(/_/g, '/');
  const key = Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')), (char) => char.charCodeAt(0));
  const registered = await registration();
  const existing = await registered.pushManager.getSubscription();
  const subscription = existing || await registered.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const response = await client.post(TRANSFER_PUSH_API, { subscription: subscription.toJSON() });
  if (response.data.enabled !== true) throw new Error('通知設定尚未儲存，請重試。');
  return subscription;
}

export async function disableTransferPush(client: TransferPushApi, subscription: PushSubscription | null) {
  if (!subscription) throw new Error('找不到此裝置的通知設定，請重新整理後再試。');
  const response = await client.delete(TRANSFER_PUSH_API, { data: { endpoint: subscription.endpoint } });
  if (response.data.enabled !== false) throw new Error('通知設定尚未停用，請重試。');
  // Server disabling is authoritative; keep the browser subscription reusable for later enable.
}
