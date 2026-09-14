const STATIC_CACHE_PREFIX = "matrix-pwa-shell-";
const STATIC_CACHE_NAME = "matrix-pwa-shell-__BUILD_ID__";
// Filled by pwa-build-version.mjs from this exact build, including lazy chunks.
const BUILD_ASSET_PATHS = [];
const SHELL_READY_PATH = "/__matrix_pwa_shell_ready__";
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
  // Cache Storage is optional, but an incomplete update must not replace a
  // working cache when storage is available.
  if (!cache) return;
  const shell = await fetch("/", { cache: "reload" });
  const paths = await shellAssetPaths(shell);
  if (BUILD_ASSET_PATHS.length && paths.some(path => !BUILD_ASSET_PATHS.includes(path))) {
    throw new Error("PWA_BUILD_MISMATCH");
  }
  await prepareAssets(cache, [...new Set([...paths, ...BUILD_ASSET_PATHS])]);
  await cache.put("/", shell.clone());
  await cache.put("/index.html", shell.clone());
  await cache.put(SHELL_READY_PATH, new Response(STATIC_CACHE_NAME));
  // Icons are optional; an unavailable icon must not discard a complete app.
  await Promise.all(APP_SHELL_PATHS.filter(path => path !== "/" && path !== "/index.html").map(async path => {
    try { await cacheResponse(cache, path, await loadAsset(cache, path)); } catch { /* Retry optional artwork on demand. */ }
  }));
}

async function clearOldStaticCaches() {
  try {
    const cache = await openStaticCache();
    const ready = await cacheMatch(cache, SHELL_READY_PATH);
    if (!ready || await ready.text() !== STATIC_CACHE_NAME) return;
    const names = await caches.keys();
    // Keep the preceding generation for pages still using its hashed assets.
    let previous;
    for (const name of names.filter(name => name.startsWith(STATIC_CACHE_PREFIX) && name !== STATIC_CACHE_NAME).reverse()) {
      if (await cachedShell(await caches.open(name))) { previous = name; break; }
    }
    await Promise.all(names
      .filter((name) => name.startsWith(STATIC_CACHE_PREFIX) && name !== STATIC_CACHE_NAME && name !== previous)
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
    // A prior deployment's HTML may still be fresh in the HTTP cache. Revalidate
    // before preparing its assets; complete cached shells remain the fallback.
    const response = await fetch(event.request, { cache: "no-cache" });
    // Only the main PWA entry is an app shell. Never store admin/other documents
    // under '/', or persist a LINE callback response in the shell cache.
    const url = new URL(event.request.url);
    if (!["/", "/index.html"].includes(url.pathname) || url.search) return response;
    const cache = await openStaticCache();
    const paths = await shellAssetPaths(response);
    const stored = await prepareAssets(cache, paths, false);
    if (stored) await cacheResponse(cache, "/", response);
    return response;
  } catch {
    return await completeCachedShell() || offlineNavigationResponse();
  }
}

async function handleStaticAsset(event) {
  const cache = await openStaticCache();
  return loadAsset(cache, event.request, event);
}

function validAsset(request, response) {
  if (!response?.ok) return false;
  const pathname = new URL(typeof request === "string" ? request : request.url, self.location.origin).pathname;
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (request.destination === "style" || /\.css$/i.test(pathname)) return type === "text/css";
  if (request.destination === "script" || /\.m?js$/i.test(pathname)) {
    return ["text/javascript", "application/javascript", "application/x-javascript", "text/ecmascript", "application/ecmascript"].includes(type);
  }
  return type !== "text/html";
}

async function cachedAsset(cache, request) {
  const response = await cacheMatch(cache, request);
  if (validAsset(request, response)) return response;
  if (response) {
    try { await cache.delete(request); } catch { /* Invalid content is never returned. */ }
  }
}

async function previousCaches() {
  try {
    return (await caches.keys()).filter(name => name.startsWith(STATIC_CACHE_PREFIX) && name !== STATIC_CACHE_NAME).reverse();
  } catch { return []; }
}

async function findCachedAsset(cache, request) {
  const current = await cachedAsset(cache, request);
  if (current) return current;
  // Only immutable Vite paths may be reused across versions.
  const url = new URL(typeof request === "string" ? request : request.url, self.location.origin);
  if (!url.pathname.startsWith("/assets/")) return;
  for (const name of await previousCaches()) {
    try {
      const result = await cachedAsset(await caches.open(name), request);
      if (result) return result;
    } catch { /* Another version may still contain the asset. */ }
  }
}

async function loadAsset(cache, request, event) {
  const cached = await findCachedAsset(cache, request);
  if (cached) return cached;
  // Bypass the HTTP cache as well as removing invalid Cache Storage entries.
  const response = await fetch(request, { cache: "reload" });
  if (!validAsset(request, response)) throw new Error("PWA_INVALID_ASSET_RESPONSE");
  if (event) keepAlive(event, cacheResponse(cache, request, response));
  return response;
}

async function shellAssetPaths(response) {
  if (!response?.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("text/html")) throw new Error("PWA_INVALID_SHELL");
  const html = await response.clone().text();
  const paths = [];
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) || []) {
    const attributes = Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map(([, key, value]) => [key.toLowerCase(), value]));
    const asset = /^<script/i.test(tag) && attributes.type === "module" ? attributes.src
      : ["stylesheet", "modulepreload"].includes(attributes.rel) ? attributes.href : null;
    if (!asset) continue;
    const url = new URL(asset, self.location.origin);
    if (url.origin !== self.location.origin || !url.pathname.startsWith("/assets/")) throw new Error("PWA_INVALID_SHELL_ASSET");
    paths.push(url.pathname + url.search);
  }
  if (!paths.some(path => /\.css(?:\?|$)/.test(path)) || !paths.some(path => /\.m?js(?:\?|$)/.test(path))) throw new Error("PWA_INCOMPLETE_SHELL");
  return [...new Set(paths)];
}

async function prepareAssets(cache, paths, requireStorage = true) {
  // Fetch and validate the complete set before committing its HTML.
  const assets = await Promise.all(paths.map(async path => [path, await loadAsset(cache, path)]));
  if (!cache) return false;
  try {
    await Promise.all(assets.map(([path, response]) => cache.put(path, response.clone())));
    return true;
  } catch (error) {
    if (requireStorage) throw error;
    return false;
  }
}

async function cachedShell(cache) {
  try {
    const shell = await cacheMatch(cache, "/");
    const paths = await shellAssetPaths(shell);
    const assets = await Promise.all(paths.map(path => cachedAsset(cache, path)));
    if (assets.every(Boolean)) return shell;
  } catch { /* A partial generation cannot serve a usable app. */ }
}

async function completeCachedShell() {
  for (const name of [STATIC_CACHE_NAME, ...await previousCaches()]) {
    try {
      const cache = await caches.open(name);
      const shell = await cachedShell(cache);
      if (shell) return shell;
    } catch { /* Try an older complete generation, never incomplete HTML. */ }
  }
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
  event.waitUntil(precacheAppShell().then(skipWaiting).catch(async error => {
    try {
      const cache = await openStaticCache();
      // A reinstall may share an existing complete generation. Keep it intact.
      if (!await cachedShell(cache)) await caches.delete(STATIC_CACHE_NAME);
    } catch { /* Cleanup must not mask the failed installation. */ }
    throw error;
  }));
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
  const tag = typeof payload.tag === "string" && payload.tag.trim() && payload.tag.length <= 128
    ? payload.tag : null;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192x192.png",
      ...(tag ? { tag, renotify: false } : {}),
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
