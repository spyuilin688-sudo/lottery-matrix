import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadWorker() {
  const source = await readFile(new URL('../public/push-service-worker.js', import.meta.url), 'utf8');
  const listeners = new Map();
  const windowClients = [];
  const workerScope = {
    location: { origin: 'https://matrixlottery.idv.tw' },
    clients: {
      matchAll: async () => windowClients,
      get: async (id) => windowClients.find((client) => client.id === id),
      openWindow: async (url) => {
        const opened = { id: 'opened-pwa', url, focus: async () => undefined, postMessage() {} };
        windowClients.push(opened);
        return opened;
      },
      claim: async () => undefined,
    },
    registration: {},
    caches: {
      open: async () => ({ addAll: async () => undefined, match: async () => undefined, put: async () => undefined }),
      keys: async () => [],
      delete: async () => true,
    },
    Request,
    Response,
    URL,
    URLSearchParams,
    Promise,
    Set,
    Map,
    Date,
    Math,
    console,
    fetch: async () => new Response('ok'),
    addEventListener: (type, listener) => listeners.set(type, listener),
    skipWaiting: async () => undefined,
    crypto: globalThis.crypto,
  };
  const context = vm.createContext({ self: workerScope, ...workerScope });
  vm.runInContext(source, context, { filename: 'push-service-worker.js' });
  return { listeners, windowClients };
}

test('hands a LINE OAuth callback from a browser client back to the installed PWA client', async () => {
  const { listeners, windowClients } = await loadWorker();
  let focused = false;
  const callbackMessages = [];
  const pwaMessages = [];
  const pwa = {
    id: 'pwa-client',
    url: 'https://matrixlottery.idv.tw/',
    postMessage: (message) => {
      pwaMessages.push(message);
      if (message.type === 'matrix-line-pwa-ping') {
        listeners.get('message')({
          data: { type: 'matrix-line-pwa-identified', requestId: message.requestId },
          source: pwa,
          origin: 'https://matrixlottery.idv.tw',
          waitUntil: () => undefined,
        });
      }
    },
    focus: async () => { focused = true; },
  };
  const callback = {
    id: 'browser-callback',
    url: 'https://matrixlottery.idv.tw/?code=oauth-code',
    postMessage: (message) => callbackMessages.push(message),
  };
  windowClients.push(callback, pwa);

  const waits = [];
  listeners.get('message')({
    data: { type: 'matrix-line-pwa-return-request' },
    source: callback,
    origin: 'https://matrixlottery.idv.tw',
    waitUntil: (promise) => waits.push(Promise.resolve(promise)),
  });
  await Promise.all(waits);

  assert.equal(focused, true);
  assert.deepEqual(pwaMessages.map(({ type }) => type), [
    'matrix-line-pwa-ping',
    'matrix-line-pwa-return',
  ]);
  assert.deepEqual(callbackMessages, [
    { type: 'matrix-line-pwa-return-result', ok: true },
  ]);
});
