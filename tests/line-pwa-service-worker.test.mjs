import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

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
    setTimeout,
    clearTimeout,
    fetch: async () => new Response('ok'),
    addEventListener: (type, listener) => listeners.set(type, listener),
    skipWaiting: async () => undefined,
    crypto: globalThis.crypto,
  };
  const context = vm.createContext({ self: workerScope, ...workerScope });
  vm.runInContext(source, context, { filename: 'push-service-worker.js' });
  return { listeners, windowClients, workerScope };
}

test('hands a LINE OAuth callback from a browser client back to the installed PWA client', async () => {
  const { listeners, windowClients } = await loadWorker();
  let focused = false;
  const callbackMessages = [];
  const pwaMessages = [];
  const callbackUrl = 'https://matrixlottery.idv.tw/?code=oauth-code&state=abc#access_token=token';
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
    navigate: async (url) => {
      pwa.url = url;
      return pwa;
    },
  };
  const callback = {
    id: 'browser-callback',
    url: callbackUrl,
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
  assert.equal(pwa.url, callbackUrl);
  assert.deepEqual(pwaMessages.map(({ type }) => type), [
    'matrix-line-pwa-ping',
  ]);
  assert.deepEqual(callbackMessages.filter(({ type }) => type === 'matrix-line-pwa-return-result').map(({ type, ok }) => ({ type, ok })), [
    { type: 'matrix-line-pwa-return-result', ok: true },
  ]);
});

test('does not claim a foreground return when navigation succeeds but focus is refused', async () => {
  const { listeners, windowClients, workerScope } = await loadWorker();
  const messages = [];
  const pwa = { id: 'pwa', url: 'https://matrixlottery.idv.tw/', postMessage() {},
    navigate: async () => pwa, focus: async () => { throw Object.assign(new Error('private-callback-token'), { name: 'InvalidAccessError' }); } };
  const callback = { id: 'callback', url: 'https://matrixlottery.idv.tw/?code=callback-code', postMessage: (data) => messages.push(data) };
  windowClients.push(pwa, callback);
  workerScope.clients.openWindow = async () => { throw new Error('InvalidAccessError'); };
  listeners.get('message')({ data: { type: 'matrix-line-pwa-ready' }, source: pwa });
  const waits = [];
  listeners.get('message')({ data: { type: 'matrix-line-pwa-return-request' }, source: callback, waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.equal(messages.at(-1).ok, false);
  assert.equal(messages.at(-1).diagnostic.code, 'PWA_FOCUS_REJECTED');
  assert.equal(messages.at(-1).diagnostic.errorName, 'InvalidAccessError');
  assert.equal(messages.at(-1).diagnostic.workerBuild, 'matrix-pwa-shell-__BUILD_ID__');
  assert.equal(JSON.stringify(messages).includes('private-callback-token'), false);
  assert.equal(JSON.stringify(messages).includes('callback-code'), false);
});

test('reports a missing PWA separately from client enumeration failure', async () => {
  for (const unavailable of [false, true]) {
    const { listeners, workerScope } = await loadWorker();
    const messages = [];
    const callback = { id: 'callback', url: 'https://matrixlottery.idv.tw/?code=secret', postMessage: (data) => messages.push(data) };
    if (unavailable) workerScope.clients.matchAll = async () => { throw Object.assign(new Error('secret'), { name: 'SecurityError' }); };
    const waits = [];
    listeners.get('message')({ data: { type: 'matrix-line-pwa-return-request', requestId: 'diagnostic-1' }, source: callback, waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    const result = messages.at(-1);
    assert.equal(result.ok, false);
    assert.equal(result.requestId, 'diagnostic-1');
    assert.equal(result.diagnostic.code, unavailable ? 'PWA_CLIENT_LOOKUP_FAILED' : 'PWA_CLIENT_NOT_FOUND');
    assert.equal(result.diagnostic.errorName, unavailable ? 'SecurityError' : undefined);
    assert.equal(JSON.stringify(messages).includes('secret'), false);
  }
});

test('reports the current stage before a focus request stalls', async () => {
  const { listeners, windowClients } = await loadWorker();
  const messages = [];
  let release;
  const pwa = { id: 'pwa', url: 'https://matrixlottery.idv.tw/', postMessage() {},
    focus: () => new Promise((resolve) => { release = resolve; }), navigate: async () => pwa };
  const callback = { id: 'callback', url: 'https://matrixlottery.idv.tw/?code=secret', postMessage: (data) => messages.push(data) };
  windowClients.push(pwa, callback);
  listeners.get('message')({ data: { type: 'matrix-line-pwa-ready' }, source: pwa });
  const waits = [];
  listeners.get('message')({ data: { type: 'matrix-line-pwa-return-request' }, source: callback, waitUntil: (p) => waits.push(p) });
  for (let i = 0; i < 10 && !release; i += 1) await Promise.resolve();
  try {
    assert.equal(messages.at(-1)?.type, 'matrix-line-pwa-return-progress');
    assert.equal(messages.at(-1)?.diagnostic.code, 'PWA_FOCUS_STARTED');
  } finally {
    release?.(pwa);
    await Promise.all(waits);
  }
});

test('focuses only the PWA that started the matching popup login', async () => {
  const { listeners, windowClients } = await loadWorker();
  const id = '11111111-1111-4111-8111-111111111111';
  const focused = [];
  const messages = [];
  const other = { id: 'other-pwa', url: 'https://matrixlottery.idv.tw/', postMessage() {}, focus: async () => focused.push('other') };
  const pwa = { id: 'login-pwa', url: 'https://matrixlottery.idv.tw/', postMessage() {}, focus: async () => { focused.push('login'); return pwa; } };
  const callback = { id: 'callback', url: `https://matrixlottery.idv.tw/?matrix_line_return=${id}#access_token=callback-token`, postMessage: (data) => messages.push(data) };
  windowClients.push(other, pwa, callback);
  listeners.get('message')({ data: { type: 'matrix-line-pwa-ready' }, source: other });
  listeners.get('message')({ data: { type: 'matrix-line-pwa-ready', attemptId: id }, source: pwa });
  const waits = [];
  listeners.get('message')({ data: { type: 'matrix-line-pwa-focus-request', attemptId: id }, source: callback, waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.deepEqual(focused, ['login']);
  assert.equal(messages.at(-1)?.ok, true);
  assert.equal(messages.at(-1)?.attemptId, id);
});

test('rejects a popup focus request whose callback URL has another attempt ID', async () => {
  const { listeners, windowClients } = await loadWorker();
  const id = '11111111-1111-4111-8111-111111111111';
  let focused = false;
  const messages = [];
  const pwa = { id: 'pwa', url: 'https://matrixlottery.idv.tw/', focus: async () => { focused = true; } };
  const callback = { id: 'callback', url: 'https://matrixlottery.idv.tw/?matrix_line_return=22222222-2222-4222-8222-222222222222#access_token=callback-token', postMessage: (data) => messages.push(data) };
  windowClients.push(pwa, callback);
  listeners.get('message')({ data: { type: 'matrix-line-pwa-ready', attemptId: id }, source: pwa });
  const waits = [];
  listeners.get('message')({ data: { type: 'matrix-line-pwa-focus-request', attemptId: id }, source: callback, waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.equal(focused, false);
  assert.equal(messages.at(-1)?.ok, false);
});

test('recovers the exact waiting PWA after the service worker has restarted', async () => {
  const { listeners, windowClients } = await loadWorker();
  const id = '11111111-1111-4111-8111-111111111111';
  let focused = false;
  const messages = [];
  const pwa = { id: 'pwa', url: 'https://matrixlottery.idv.tw/', focus: async () => { focused = true; },
    postMessage: (data) => {
      if (data.type === 'matrix-line-pwa-login-ping' && data.attemptId === id) {
        listeners.get('message')({ data: { type: 'matrix-line-pwa-ready', attemptId: id }, source: pwa });
      }
    } };
  const callback = { id: 'callback', url: `https://matrixlottery.idv.tw/?matrix_line_return=${id}#access_token=callback-token`, postMessage: (data) => messages.push(data) };
  windowClients.push(pwa, callback);
  const waits = [];
  listeners.get('message')({ data: { type: 'matrix-line-pwa-focus-request', attemptId: id }, source: callback, waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.equal(focused, true);
  assert.equal(messages.at(-1)?.ok, true);
});
