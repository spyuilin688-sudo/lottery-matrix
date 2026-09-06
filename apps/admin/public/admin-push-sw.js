self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener('push', (event) => {
  // Keep financial/member details off the lock screen, regardless of payload contents.
  event.waitUntil(self.registration.showNotification('新轉帳申請', {
    body: '有新的轉帳申請待處理，請登入後台查看。',
    icon: new URL('resources/admin-backend-icon.png', self.registration.scope).href,
    tag: 'admin-transfer-request',
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL('./#transfer-requests', self.registration.scope);
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
