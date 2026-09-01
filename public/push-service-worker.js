const STATIC_CACHE_PREFIX = "matrix-pwa-shell-";
const STATIC_CACHE_NAME = `${STATIC_CACHE_PREFIX}v1`;
const APP_SHELL_PATHS = ["/", "/index.html", "/manifest.webmanifest", "/favicon.svg"];
const STATIC_DESTINATIONS = new Set(["font", "image", "manifest", "script", "style"]);
const SENSITIVE_PATH_SEGMENT = /(?:^|\/)(?:auth|login|logout|sign-in|signin|sign-up|signup|member|membership|subscription|subscribe|account|profile)(?:\/|$)/;

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
      icon: "/favicon.svg",
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
