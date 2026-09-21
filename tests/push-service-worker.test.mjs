import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const workerPath = new URL("../public/push-service-worker.js", import.meta.url);
const mainPath = new URL("../src/main.tsx", import.meta.url);

function createWorker({ origin = "https://pwa.example", windowClients = [] } = {}) {
  const source = readFileSync(workerPath, "utf8");
  const listeners = new Map();
  const notifications = [];
  const openWindowCalls = [];
  const clients = {
    matchAll: async () => windowClients,
    openWindow: async (url) => {
      openWindowCalls.push(url);
      return { url };
    },
  };
  const registration = {
    showNotification: async (title, options) => {
      notifications.push({ title, options });
    },
  };
  const self = {
    location: { origin },
    registration,
    clients,
    addEventListener: (type, handler) => listeners.set(type, handler),
  };

  vm.runInNewContext(source, { URL, self }, { filename: workerPath.pathname });

  async function dispatch(type, event) {
    const waits = [];
    listeners.get(type)({
      ...event,
      waitUntil: (promise) => waits.push(Promise.resolve(promise)),
    });
    await Promise.all(waits);
  }

  return { dispatch, notifications, openWindowCalls };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("service worker source exposes push and notification click listeners", () => {
  assert.equal(existsSync(workerPath), true, "public/push-service-worker.js must exist");
  const source = readFileSync(workerPath, "utf8");
  assert.match(source, /addEventListener\(["']push["']/);
  assert.match(source, /showNotification/);
  assert.match(source, /addEventListener\(["']notificationclick["']/);
  assert.match(source, /clients\.openWindow/);
  assert.match(source, /icon:\s*["']\/icons\/icon-192x192\.png["']/);
});

test("push event displays a valid payload and preserves its same-origin path", async () => {
  const worker = createWorker();

  await worker.dispatch("push", {
    data: { json: () => ({ title: "Result", body: "Draw complete", url: "/results?draw=1#latest" }) },
  });

  assert.deepEqual(plain(worker.notifications), [{
    title: "Result",
    options: {
      body: "Draw complete",
      icon: "/icons/icon-192x192.png",
      data: { url: "/results?draw=1#latest" },
    },
  }]);
});

test("push event uses safe empty defaults when data is absent", async () => {
  const worker = createWorker();

  await worker.dispatch("push", {});

  assert.deepEqual(plain(worker.notifications), [{
    title: "",
    options: {
      body: "",
      icon: "/icons/icon-192x192.png",
      data: { url: "/" },
    },
  }]);
});

test('replayed notifications pass a stable tag without requesting another alert', async () => {
  const worker = createWorker();
  for (const tag of ['matrix-outbox-1', 'matrix-outbox-1', 'matrix-outbox-2']) {
    await worker.dispatch('push', { data: { json: () => ({ title: 'Result', body: 'Draw complete', url: '/', tag }) } });
  }
  assert.deepEqual(worker.notifications.map(item => item.options.tag), ['matrix-outbox-1', 'matrix-outbox-1', 'matrix-outbox-2']);
  assert.deepEqual(worker.notifications.map(item => item.options.renotify), [false, false, false]);
});

test('invalid replacement tags preserve ordinary notification delivery', async () => {
  for (const tag of [null, {}, 1, '', ' ', 'a'.repeat(129)]) {
    const worker = createWorker();
    await worker.dispatch('push', { data: { json: () => ({ title: 'Result', body: 'Available', tag }) } });
    assert.equal(worker.notifications.length, 1);
    assert.equal(worker.notifications[0].options.body, 'Available');
    assert.equal(worker.notifications[0].options.tag, undefined);
  }
});

test("push event uses safe empty defaults when JSON is malformed", async () => {
  const worker = createWorker();

  await assert.doesNotReject(() => worker.dispatch("push", {
    data: { json: () => { throw new SyntaxError("invalid push JSON"); } },
  }));
  assert.equal(worker.notifications[0].title, "");
  assert.equal(worker.notifications[0].options.body, "");
  assert.deepEqual(plain(worker.notifications[0].options.data), { url: "/" });
});

test("push event rejects external, javascript, and malformed URLs", async () => {
  for (const url of ["https://attacker.example/phish", "javascript:alert(1)", "https://%zz"]) {
    const worker = createWorker();

    await worker.dispatch("push", {
      data: { json: () => ({ title: "Unsafe", body: "Do not leave app", url }) },
    });

    assert.deepEqual(plain(worker.notifications[0].options.data), { url: "/" }, url);
  }
});

test("notification click focuses an existing same-origin client and closes the notification", async () => {
  let closeCalls = 0;
  let focusCalls = 0;
  const sameOriginClient = {
    url: "https://pwa.example/dashboard",
    focus: async () => {
      focusCalls += 1;
    },
  };
  const worker = createWorker({
    windowClients: [{ url: "https://attacker.example/", focus: async () => {} }, sameOriginClient],
  });

  await worker.dispatch("notificationclick", {
    notification: {
      data: { url: "/dashboard" },
      close: () => {
        closeCalls += 1;
      },
    },
  });

  assert.equal(closeCalls, 1);
  assert.equal(focusCalls, 1);
  assert.deepEqual(worker.openWindowCalls, []);
});

test("notification click opens a safe same-origin URL when no client exists", async () => {
  let closeCalls = 0;
  const worker = createWorker();

  await worker.dispatch("notificationclick", {
    notification: {
      data: { url: "https://attacker.example/phish" },
      close: () => {
        closeCalls += 1;
      },
    },
  });

  assert.equal(closeCalls, 1);
  assert.deepEqual(worker.openWindowCalls, ["/"]);
});

test("notification click navigates the PWA target before focusing and ignores admin windows", async () => {
  const actions = [];
  const worker = createWorker({ windowClients: [
    { url: 'https://pwa.example/admin/', focus: async () => actions.push('admin-focus') },
    {
      url: 'https://pwa.example/',
      navigate: async (url) => {
        actions.push(['navigate', url]);
        return { focus: async () => actions.push('pwa-focus') };
      },
      focus: async () => actions.push('old-focus'),
    },
  ] });
  await worker.dispatch('notificationclick', {
    notification: { data: { url: '/results?draw=1#latest' }, close() {} },
  });
  assert.deepEqual(actions, [['navigate', '/results?draw=1#latest'], 'pwa-focus']);
  assert.deepEqual(worker.openWindowCalls, []);
});

test("notification click prefers an already matching target over navigating another window", async () => {
  const actions = [];
  const worker = createWorker({ windowClients: [
    { url: 'https://pwa.example/', focus: async () => actions.push('wrong-focus') },
    { url: 'https://pwa.example/results?draw=1#latest', focus: async () => actions.push('target-focus') },
  ] });
  await worker.dispatch('notificationclick', {
    notification: { data: { url: '/results?draw=1#latest' }, close() {} },
  });
  assert.deepEqual(actions, ['target-focus']);
  assert.deepEqual(worker.openWindowCalls, []);
});

test("notification click opens the target when only admin or invalid clients exist", async () => {
  const actions = [];
  const worker = createWorker({ windowClients: [
    { url: 'https://pwa.example/admin', focus: async () => actions.push('admin-focus') },
    { url: 'https://pwa.example/admin/users', focus: async () => actions.push('admin-focus') },
    { url: 'bad-url', focus: async () => actions.push('invalid-focus') },
  ] });
  await worker.dispatch('notificationclick', {
    notification: { data: { url: '/results' }, close() {} },
  });
  assert.deepEqual(actions, []);
  assert.deepEqual(worker.openWindowCalls, ['/results']);
});

test("notification click opens the safe target when a PWA navigation or focus fails", async () => {
  for (const navigate of [undefined, async () => null, async () => { throw new Error('closed'); },
    async () => ({ focus: async () => { throw new Error('cannot focus'); } })]) {
    let oldFocusCalls = 0;
    const worker = createWorker({ windowClients: [{
      url: 'https://pwa.example/previous', navigate,
      focus: async () => { oldFocusCalls += 1; },
    }] });
    await worker.dispatch('notificationclick', {
      notification: { data: { url: 'https://attacker.example/phish' }, close() {} },
    });
    assert.equal(oldFocusCalls, 0);
    assert.deepEqual(worker.openWindowCalls, ['/']);
  }
});

test("main starts the observable push service worker registration helper", () => {
  const source = readFileSync(mainPath, "utf8");
  assert.match(source, /if\s*\(\s*["']serviceWorker["']\s+in\s+navigator\s*\)/);
  assert.match(source, /const linePwaWorkerReady = [\s\S]*registerPushServiceWorker\(\)/);
  assert.match(source, /await linePwaWorkerReady/);
  const pushSource = readFileSync(new URL("../src/push-subscription.ts", import.meta.url), "utf8");
  assert.match(pushSource, /SERVICE_WORKER_PATH = ["']\/push-service-worker\.js["']/);
  assert.match(pushSource, /serviceWorker\.register\(SERVICE_WORKER_PATH\)/);
});
