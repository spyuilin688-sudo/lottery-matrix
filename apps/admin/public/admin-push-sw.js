self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener('push', (event) => {
  let payload;
  try { payload = event.data?.json(); } catch { payload = null; }
  if (payload?.kind === 'security') {
    const count = Number.isSafeInteger(payload.count) && payload.count > 0 && payload.count <= 2147483646
      ? `（${payload.count} 次請求）` : '';
    event.waitUntil(self.registration.showNotification('安全監控提醒', {
      body: `偵測到異常請求量${count}，請檢查服務安全紀錄。`,
      icon: new URL('icons/admin-192x192.png', self.registration.scope).href,
      tag: 'admin-security-monitor',
      data: { kind: 'security' },
    }));
    return;
  }
  // Keep financial/member details off the lock screen, regardless of payload contents.
  event.waitUntil(self.registration.showNotification('新轉帳申請', {
    body: '有新的轉帳申請待處理，請登入後台查看。',
    icon: new URL('icons/admin-192x192.png', self.registration.scope).href,
    tag: 'admin-transfer-request',
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.kind === 'security' ? './' : './#transfer-requests', self.registration.scope);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      const url = new URL(client.url);
      if (url.origin === target.origin && url.pathname === target.pathname) {
        await client.navigate(target.href);
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(target.href);
  })());
});
