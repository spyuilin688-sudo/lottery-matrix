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

test("main starts the observable push service worker registration helper", () => {
  const source = readFileSync(mainPath, "utf8");
  assert.match(source, /if\s*\(\s*["']serviceWorker["']\s+in\s+navigator\s*\)/);
  assert.match(source, /registerPushServiceWorker\(\)\.catch\(\(\) => undefined\)/);
  const pushSource = readFileSync(new URL("../src/push-subscription.ts", import.meta.url), "utf8");
  assert.match(pushSource, /SERVICE_WORKER_PATH = ["']\/push-service-worker\.js["']/);
  assert.match(pushSource, /serviceWorker\.register\(SERVICE_WORKER_PATH\)/);
});
