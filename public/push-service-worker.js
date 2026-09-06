const STATIC_CACHE_PREFIX = "matrix-pwa-shell-";
const STATIC_CACHE_NAME = "matrix-pwa-shell-__BUILD_ID__";
const APP_SHELL_PATHS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/favicon-32x32.png",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/maskable-icon-512x512.png",
];
const STATIC_DESTINATIONS = new Set(["font", "image", "manifest", "script", "style"]);
const SENSITIVE_PATH_SEGMENT = /(?:^|\/)(?:auth|login|logout|sign-in|signin|sign-up|signup|member|membership|subscription|subscribe|account|profile)(?:\/|$)/;
const LINE_PWA_READY = "matrix-line-pwa-ready";
const LINE_PWA_PING = "matrix-line-pwa-ping";
const LINE_PWA_IDENTIFIED = "matrix-line-pwa-identified";
const LINE_PWA_RETURN_REQUEST = "matrix-line-pwa-return-request";
const LINE_PWA_RETURN = "matrix-line-pwa-return";
const LINE_PWA_RETURN_RESULT = "matrix-line-pwa-return-result";
const LINE_PWA_FOCUS_REQUEST = "matrix-line-pwa-focus-request";
const LINE_PWA_FOCUS_RESULT = "matrix-line-pwa-focus-result";
const LINE_PWA_PROBE_TIMEOUT_MS = 1_500;
const linePwaClientIds = new Set();
const pendingLinePwaProbes = new Map();
const linePwaLoginAttempts = new Map();
const pendingLinePwaLoginProbes = new Map();
const LINE_PWA_LOGIN_TTL_MS = 10 * 60 * 1_000;

function isGetRequest(request) {
  return request && request.method === "GET";
}

function isSameOrigin(request) {
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch {
    return false;
  }
}

function isSameOriginClient(client) {
  if (!client) return false;
  try {
    return new URL(client.url).origin === self.location.origin;
  } catch {
    return false;
  }
}

function postClientMessage(client, message) {
  try {
    client?.postMessage?.(message);
    return true;
  } catch {
    return false;
  }
}

function shouldBypassStaticCache(request) {
  try {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return true;

    const pathname = url.pathname.toLowerCase();
    return pathname === "/api"
      || pathname.startsWith("/api/")
      || pathname.includes("/rpc/")
      || SENSITIVE_PATH_SEGMENT.test(pathname);
  } catch {
    return true;
  }
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || request.destination === "document";
}

function isStaticAssetRequest(request) {
  if (!isSameOrigin(request)) return false;
  if (STATIC_DESTINATIONS.has(request.destination)) return true;

  try {
    return /\.(?:avif|css|gif|ico|jpe?g|js|mjs|png|svg|webp|woff2?)$/i.test(new URL(request.url).pathname);
  } catch {
    return false;
  }
}

async function openStaticCache() {
  try {
    if (typeof caches === "undefined" || !caches || typeof caches.open !== "function") return null;
    return await caches.open(STATIC_CACHE_NAME);
  } catch {
    return null;
  }
}

async function cacheMatch(cache, request) {
  if (!cache || typeof cache.match !== "function") return undefined;
  try {
    return await cache.match(request);
  } catch {
    return undefined;
  }
}

async function cacheResponse(cache, request, response) {
  if (!cache || !response || !response.ok || typeof cache.put !== "function") return;
  try {
    await cache.put(request, response.clone());
  } catch {
    // Cache writes are optional. The successful network response remains usable.
  }
}

function keepAlive(event, operation) {
  if (!event || typeof event.waitUntil !== "function") return;
  try {
    event.waitUntil(Promise.resolve(operation).catch(() => undefined));
  } catch {
    // A cache lifecycle failure must not alter the request response.
  }
}

async function precacheAppShell() {
  const cache = await openStaticCache();
  if (!cache || typeof cache.addAll !== "function") return;
  try {
    await cache.addAll(APP_SHELL_PATHS);
  } catch {
    // Installation remains successful when a cache is unavailable or the network is temporarily offline.
  }
}

async function clearOldStaticCaches() {
  try {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(STATIC_CACHE_PREFIX) && name !== STATIC_CACHE_NAME)
      .map(async (name) => {
        try {
          await caches.delete(name);
        } catch {
          // A failed delete must not block activation of the current worker.
        }
      }));
  } catch {
    // Cache Storage is an optional capability.
  }
}

async function claimClients() {
  try {
    if (self.clients && typeof self.clients.claim === "function") await self.clients.claim();
  } catch {
    // Client claiming is optional for a successful activation.
  }
}

async function skipWaiting() {
  try {
    if (typeof self.skipWaiting === "function") await self.skipWaiting();
  } catch {
    // The browser may continue with its current worker until its normal update cycle.
  }
}

function offlineNavigationResponse() {
  return new Response("<!doctype html><html lang=\"zh-Hant-TW\"><head><meta charset=\"utf-8\"><title>離線</title></head><body>目前無法連線。</body></html>", {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function handleNavigation(event) {
  try {
    const response = await fetch(event.request);
    if (response && response.ok) keepAlive(event, (async () => {
      const cache = await openStaticCache();
      await cacheResponse(cache, "/", response);
    })());
    return response;
  } catch {
    const cache = await openStaticCache();
    return (await cacheMatch(cache, event.request))
      || (await cacheMatch(cache, "/"))
      || (await cacheMatch(cache, "/index.html"))
      || offlineNavigationResponse();
  }
}

async function handleStaticAsset(event) {
  const cache = await openStaticCache();
  const cached = await cacheMatch(cache, event.request);
  if (cached) return cached;

  const response = await fetch(event.request);
  if (response && response.ok) keepAlive(event, cacheResponse(cache, event.request, response));
  return response;
}

function lineCallbackUrl(client) {
  try {
    const url = new URL(client?.url ?? "", self.location.origin);
    if (url.origin !== self.location.origin || url.pathname !== "/") return null;
    if (url.searchParams.has("matrix_line_return")) return null;
    const query = url.searchParams;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const hasOAuthParam = [query, hash].some((params) =>
      params.has("code")
      || params.has("error")
      || params.has("error_code")
      || params.has("access_token"),
    );
    return hasOAuthParam ? url.href : null;
  } catch {
    return null;
  }
}

async function findLinePwaClient(report, callbackClientId) {
  for (const id of [...linePwaClientIds]) {
    if (id === callbackClientId) continue;
    try {
      const client = await self.clients.get(id);
      if (isSameOriginClient(client)) return client;
      linePwaClientIds.delete(id);
    } catch (error) {
      report('PWA_CLIENT_STALE', error);
      linePwaClientIds.delete(id);
    }
  }

  let clientList = [];
  try {
    clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  } catch (error) {
    report('PWA_CLIENT_LOOKUP_FAILED', error);
    return null;
  }

  const candidates = clientList.filter((client) => isSameOriginClient(client) && client.id !== callbackClientId);
  if (!candidates.length) {
    report('PWA_CLIENT_NOT_FOUND', undefined, { candidateCount: 0 });
    return null;
  }
  report('PWA_PROBE_STARTED', undefined, { candidateCount: candidates.length });

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (client) => {
      if (settled) return;
      settled = true;
      pendingLinePwaProbes.delete(requestId);
      clearTimeout(timeout);
      resolve(isSameOriginClient(client) && client.id !== callbackClientId ? client : null);
    };
    const timeout = setTimeout(() => {
      report('PWA_PROBE_TIMEOUT');
      finish(null);
    }, LINE_PWA_PROBE_TIMEOUT_MS);
    pendingLinePwaProbes.set(requestId, finish);
    for (const client of candidates) {
      postClientMessage(client, { type: LINE_PWA_PING, requestId });
    }
  });
}

async function handleLinePwaReturn(event) {
  const callbackClient = isSameOriginClient(event.source) ? event.source : null;
  const rawRequestId = event.data?.requestId;
  const requestId = typeof rawRequestId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(rawRequestId) ? rawRequestId : undefined;
  const startedAt = Date.now();
  let diagnostic;
  const report = (code, error, counts = {}) => {
    const allowedErrorNames = ['InvalidAccessError', 'InvalidStateError', 'SecurityError',
      'NotAllowedError', 'AbortError', 'NotFoundError', 'TypeError', 'Error'];
    diagnostic = { code, workerBuild: STATIC_CACHE_NAME, elapsedMs: Date.now() - startedAt, ...counts };
    if (error) diagnostic.errorName = allowedErrorNames.includes(error.name) ? error.name : 'UnknownError';
    postClientMessage(callbackClient, { type: 'matrix-line-pwa-return-progress', requestId, diagnostic });
  };
  const callbackUrl = lineCallbackUrl(callbackClient);
  let pwaClient = null;
  if (callbackUrl) {
    report('PWA_LOOKUP_STARTED');
    pwaClient = await findLinePwaClient(report, callbackClient.id);
  } else report('CALLBACK_INVALID');
  let ok = false;

  if (pwaClient && callbackUrl) {
    report('PWA_CLIENT_FOUND');
    try {
      report('PWA_FOCUS_STARTED');
      await pwaClient.focus();
      report('PWA_FOCUS_RESOLVED');
      // Transfer the callback only after focus succeeds. Otherwise the browser
      // still owns it and must be able to complete login without consuming it twice.
      try {
        report('PWA_NAVIGATION_STARTED');
        ok = Boolean(await pwaClient.navigate(callbackUrl));
        if (!ok) report('PWA_NAVIGATION_EMPTY');
      } catch (error) { report('PWA_NAVIGATION_REJECTED', error); }
      if (!ok) {
        ok = postClientMessage(pwaClient, { type: LINE_PWA_RETURN, url: callbackUrl });
        if (!ok) report('PWA_CALLBACK_POST_FAILED');
      }
      // API completion is handoff evidence, not proof of native foreground state.
      if (ok) report('HANDOFF_DISPATCHED');
    } catch (error) {
      report('PWA_FOCUS_REJECTED', error);
      // Background navigation or opening an ordinary tab is not a PWA return.
    }
  }

  postClientMessage(callbackClient, { type: LINE_PWA_RETURN_RESULT, requestId, ok, diagnostic });
}

async function findLinePwaLoginAttempt(attemptId) {
  const known = linePwaLoginAttempts.get(attemptId);
  if (known && Date.now() - known.startedAt < LINE_PWA_LOGIN_TTL_MS) return known;
  const candidates = (await self.clients.matchAll({ type: "window", includeUncontrolled: true }))
    .filter(isSameOriginClient);
  if (!candidates.length) return null;
  // Workers can stop during the native LINE handoff. Only the page still waiting
  // for this exact attempt may restore its registration; another PWA cannot win.
  return new Promise((resolve) => {
    const probes = pendingLinePwaLoginProbes.get(attemptId) ?? new Set();
    const finish = (attempt) => {
      clearTimeout(timeout);
      probes.delete(finish);
      if (!probes.size) pendingLinePwaLoginProbes.delete(attemptId);
      resolve(attempt);
    };
    const timeout = setTimeout(() => finish(null), LINE_PWA_PROBE_TIMEOUT_MS);
    probes.add(finish);
    pendingLinePwaLoginProbes.set(attemptId, probes);
    for (const client of candidates) postClientMessage(client, { type: "matrix-line-pwa-login-ping", attemptId });
  });
}

async function handleLinePwaFocus(event) {
  const callbackClient = isSameOriginClient(event.source) ? event.source : null;
  const attemptId = event.data?.attemptId;
  let ok = false;
  try {
    const url = new URL(callbackClient?.url ?? "");
    const ids = url.searchParams.getAll("matrix_line_return");
    if (url.pathname === "/" && ids.length === 1 && ids[0] === attemptId
      && typeof attemptId === "string" && /^[0-9a-f-]{36}$/i.test(attemptId)) {
      const attempt = await findLinePwaLoginAttempt(attemptId);
      const pwa = attempt ? await self.clients.get(attempt.clientId) : null;
      if (isSameOriginClient(pwa) && pwa.id !== callbackClient.id) {
        await pwa.focus();
        ok = true;
      }
    }
  } catch { /* A platform may refuse foreground activation. Keep normal login available. */ }
  postClientMessage(callbackClient, { type: LINE_PWA_FOCUS_RESULT, attemptId, ok });
}

self.addEventListener("message", (event) => {
  const type = event.data?.type;
  const source = event.source;

  if (type === LINE_PWA_READY && source?.id && isSameOriginClient(source)) {
    linePwaClientIds.add(source.id);
    const attemptId = event.data?.attemptId;
    if (typeof attemptId === "string" && /^[0-9a-f-]{36}$/i.test(attemptId)) {
      for (const [id, attempt] of linePwaLoginAttempts) {
        if (Date.now() - attempt.startedAt >= LINE_PWA_LOGIN_TTL_MS || attempt.clientId === source.id) linePwaLoginAttempts.delete(id);
      }
      const registration = { clientId: source.id, startedAt: Date.now() };
      linePwaLoginAttempts.set(attemptId, registration);
      for (const finish of [...(pendingLinePwaLoginProbes.get(attemptId) ?? [])]) finish(registration);
    }
    return;
  }

  if (type === LINE_PWA_IDENTIFIED && typeof event.data?.requestId === "string") {
    pendingLinePwaProbes.get(event.data.requestId)?.(source);
    return;
  }

  if (type === LINE_PWA_RETURN_REQUEST) {
    event.waitUntil(handleLinePwaReturn(event));
  }
  if (type === LINE_PWA_FOCUS_REQUEST) event.waitUntil(handleLinePwaFocus(event));
});

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.all([precacheAppShell(), skipWaiting()]).then(() => undefined));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await clearOldStaticCaches();
    await claimClients();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isGetRequest(request) || shouldBypassStaticCache(request)) return;

  if (isNavigationRequest(request)) {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (isStaticAssetRequest(request)) event.respondWith(handleStaticAsset(event));
});

function parsePushPayload(event) {
  try {
    const payload = event.data?.json();
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  } catch {
    return {};
  }
}

function safePwaPath(value) {
  if (typeof value !== "string") return "/";

  try {
    const parsed = new URL(value, self.location.origin);
    if (parsed.origin !== self.location.origin) return "/";
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
  } catch {
    return "/";
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  const title = typeof payload.title === "string" ? payload.title : "";
  const body = typeof payload.body === "string" ? payload.body : "";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192x192.png",
      data: { url: safePwaPath(payload.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safePwaPath(event.notification.data?.url);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const sameOriginClient = clientList.find((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });

      if (sameOriginClient && typeof sameOriginClient.focus === "function") {
        return sameOriginClient.focus();
      }

      return self.clients.openWindow(url);
    }),
  );
});
