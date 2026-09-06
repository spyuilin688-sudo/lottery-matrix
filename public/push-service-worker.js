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
const LINE_PWA_PROBE_TIMEOUT_MS = 1_500;
const linePwaClientIds = new Set();
const pendingLinePwaProbes = new Map();

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

async function findLinePwaClient() {
  for (const id of [...linePwaClientIds]) {
    try {
      const client = await self.clients.get(id);
      if (isSameOriginClient(client)) return client;
      linePwaClientIds.delete(id);
    } catch {
      linePwaClientIds.delete(id);
    }
  }

  let clientList = [];
  try {
    clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  } catch {
    return null;
  }

  const candidates = clientList.filter(isSameOriginClient);
  if (!candidates.length) return null;

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (client) => {
      if (settled) return;
      settled = true;
      pendingLinePwaProbes.delete(requestId);
      clearTimeout(timeout);
      resolve(isSameOriginClient(client) ? client : null);
    };
    const timeout = setTimeout(() => finish(null), LINE_PWA_PROBE_TIMEOUT_MS);
    pendingLinePwaProbes.set(requestId, finish);
    for (const client of candidates) {
      postClientMessage(client, { type: LINE_PWA_PING, requestId });
    }
  });
}

async function handleLinePwaReturn(event) {
  const callbackClient = isSameOriginClient(event.source) ? event.source : null;
  const callbackUrl = lineCallbackUrl(callbackClient);
  const pwaClient = await findLinePwaClient();
  let ok = false;

  if (pwaClient && callbackUrl) {
    let navigated = false;
    if (typeof pwaClient.navigate === "function") {
      try {
        await pwaClient.navigate(callbackUrl);
        navigated = true;
      } catch {
        // Fall through to the page-side navigation handler.
      }
    }

    postClientMessage(pwaClient, { type: LINE_PWA_RETURN, url: callbackUrl });

    try {
      await pwaClient.focus();
      ok = true;
    } catch {
      // Focus may be refused when the OAuth redirect no longer has transient activation.
    }

    if (!ok) {
      try {
        const opened = await self.clients.openWindow(callbackUrl);
        if (opened) {
          ok = true;
          try { await opened.focus(); } catch { /* Best effort only. */ }
        }
      } catch {
        // Some browsers reject openWindow without transient activation.
      }
    }

    // Navigation itself is a successful handoff even when the browser refuses foreground focus.
    ok ||= navigated;
  }

  postClientMessage(callbackClient, { type: LINE_PWA_RETURN_RESULT, ok });
}

self.addEventListener("message", (event) => {
  const type = event.data?.type;
  const source = event.source;

  if (type === LINE_PWA_READY && source?.id && isSameOriginClient(source)) {
    linePwaClientIds.add(source.id);
    return;
  }

  if (type === LINE_PWA_IDENTIFIED && typeof event.data?.requestId === "string") {
    pendingLinePwaProbes.get(event.data.requestId)?.(source);
    return;
  }

  if (type === LINE_PWA_RETURN_REQUEST) {
    event.waitUntil(handleLinePwaReturn(event));
  }
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
