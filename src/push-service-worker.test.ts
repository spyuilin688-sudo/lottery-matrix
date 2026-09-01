// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

declare const process: { cwd(): string };

type WorkerRequest = {
  destination?: string;
  method?: string;
  mode?: string;
  url: string;
};

type WorkerHandler = (event: Record<string, unknown>) => void;

const origin = 'https://matrix.test';

function requestKey(request: string | WorkerRequest) {
  return new URL(typeof request === 'string' ? request : request.url, origin).href;
}

function createWorkerHarness(options: {
  cacheOpenFailure?: boolean;
  cachePutFailure?: boolean;
  cacheDeleteFailure?: boolean;
  cacheNames?: string[];
} = {}) {
  const handlers = new Map<string, WorkerHandler>();
  const entries = new Map<string, Response>();
  const cache = {
    addAll: vi.fn(async (paths: string[]) => {
      paths.forEach((path) => entries.set(requestKey(path), new Response(`app-shell:${path}`)));
    }),
    match: vi.fn(async (request: string | WorkerRequest) => entries.get(requestKey(request))?.clone()),
    put: vi.fn(async (request: string | WorkerRequest, response: Response) => {
      if (options.cachePutFailure) throw new Error('cache put failed');
      entries.set(requestKey(request), response.clone());
    }),
  };
  const cacheStorage = {
    delete: vi.fn(async () => {
      if (options.cacheDeleteFailure) throw new Error('cache delete failed');
      return true;
    }),
    keys: vi.fn(async () => options.cacheNames ?? ['matrix-pwa-shell-v0', 'matrix-pwa-shell-v1']),
    open: vi.fn(async () => {
      if (options.cacheOpenFailure) throw new Error('cache storage unavailable');
      return cache;
    }),
  };
  const showNotification = vi.fn(async () => undefined);
  const focus = vi.fn(async () => undefined);
  const openWindow = vi.fn(async () => undefined);
  const claim = vi.fn(async () => undefined);
  const skipWaiting = vi.fn(async () => undefined);
  const worker = {
    addEventListener(type: string, handler: WorkerHandler) {
      handlers.set(type, handler);
    },
    clients: {
      claim,
      matchAll: vi.fn(async () => [{ url: `${origin}/explore`, focus }]),
      openWindow,
    },
    location: { origin },
    registration: { showNotification },
    skipWaiting,
  };
  const network = vi.fn<(...args: unknown[]) => Promise<Response>>();
  const source = readFileSync(`${process.cwd()}/public/push-service-worker.js`, 'utf8');
  new Function('self', 'caches', 'fetch', source)(worker, cacheStorage, network);

  async function dispatchLifecycle(type: 'install' | 'activate') {
    const waits: Promise<unknown>[] = [];
    handlers.get(type)?.({ waitUntil: (value: Promise<unknown>) => waits.push(Promise.resolve(value)) });
    await Promise.all(waits);
  }

  async function dispatchFetch(request: WorkerRequest) {
    const waits: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    handlers.get('fetch')?.({
      request,
      respondWith: (value: Promise<Response> | Response) => { response = Promise.resolve(value); },
      waitUntil: (value: Promise<unknown>) => waits.push(Promise.resolve(value)),
    });
    return { response: response ? await response : undefined, waited: Promise.all(waits) };
  }

  async function dispatchPush(data: unknown) {
    const waits: Promise<unknown>[] = [];
    handlers.get('push')?.({
      data: { json: () => data },
      waitUntil: (value: Promise<unknown>) => waits.push(Promise.resolve(value)),
    });
    await Promise.all(waits);
  }

  async function dispatchNotificationClick(url: string) {
    const waits: Promise<unknown>[] = [];
    const close = vi.fn();
    handlers.get('notificationclick')?.({
      notification: { close, data: { url } },
      waitUntil: (value: Promise<unknown>) => waits.push(Promise.resolve(value)),
    });
    await Promise.all(waits);
    return close;
  }

  return {
    cache,
    cacheStorage,
    claim,
    dispatchFetch,
    dispatchLifecycle,
    dispatchNotificationClick,
    dispatchPush,
    entries,
    focus,
    handlers,
    network,
    openWindow,
    showNotification,
    skipWaiting,
  };
}

describe('combined Push and PWA service worker', () => {
  it('installs a versioned app shell and preserves the existing Push listeners', async () => {
    const worker = createWorkerHarness();

    expect(worker.handlers.has('install')).toBe(true);
    expect(worker.handlers.has('activate')).toBe(true);
    expect(worker.handlers.has('fetch')).toBe(true);
    expect(worker.handlers.has('push')).toBe(true);
    expect(worker.handlers.has('notificationclick')).toBe(true);

    await worker.dispatchLifecycle('install');

    expect(worker.entries.get(requestKey('/'))).toBeDefined();
    expect(worker.skipWaiting).toHaveBeenCalledTimes(1);

    await worker.dispatchPush({ title: 'Matrix', body: '已完成', url: '/explore' });
    expect(worker.showNotification).toHaveBeenCalledWith('Matrix', {
      body: '已完成',
      icon: '/favicon.svg',
      data: { url: '/explore' },
    });

    const close = await worker.dispatchNotificationClick('/explore');
    expect(close).toHaveBeenCalledTimes(1);
    expect(worker.focus).toHaveBeenCalledTimes(1);
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it('returns a cached static asset after a successful first request goes offline', async () => {
    const worker = createWorkerHarness();
    const request: WorkerRequest = { url: `${origin}/assets/app.js`, method: 'GET', destination: 'script' };
    worker.network.mockResolvedValueOnce(new Response('bundle-v1'));

    const online = await worker.dispatchFetch(request);
    expect(await online.response?.text()).toBe('bundle-v1');
    await online.waited;

    worker.network.mockRejectedValueOnce(new Error('offline'));
    const offline = await worker.dispatchFetch(request);
    expect(await offline.response?.text()).toBe('bundle-v1');
  });

  it('uses the cached app shell when a navigation request fails and returns a non-empty fallback when none exists', async () => {
    const worker = createWorkerHarness();
    worker.entries.set(requestKey('/'), new Response('cached app shell'));
    const navigation: WorkerRequest = { url: `${origin}/explore`, method: 'GET', mode: 'navigate', destination: 'document' };
    worker.network.mockRejectedValueOnce(new Error('offline'));

    const cached = await worker.dispatchFetch(navigation);
    expect(await cached.response?.text()).toBe('cached app shell');

    const empty = createWorkerHarness();
    empty.network.mockRejectedValueOnce(new Error('offline'));
    const fallback = await empty.dispatchFetch(navigation);
    expect(fallback.response?.status).toBe(503);
    expect((await fallback.response?.text())?.trim().length).toBeGreaterThan(0);
  });

  it('uses the network response when Cache Storage cannot open or write', async () => {
    const unavailable = createWorkerHarness({ cacheOpenFailure: true });
    unavailable.network.mockResolvedValueOnce(new Response('network-without-cache'));
    const unavailableResult = await unavailable.dispatchFetch({ url: `${origin}/assets/app.css`, method: 'GET', destination: 'style' });
    expect(await unavailableResult.response?.text()).toBe('network-without-cache');
    await unavailableResult.waited;

    const full = createWorkerHarness({ cachePutFailure: true });
    full.network.mockResolvedValueOnce(new Response('network-with-full-cache'));
    const fullResult = await full.dispatchFetch({ url: `${origin}/assets/app.css`, method: 'GET', destination: 'style' });
    expect(await fullResult.response?.text()).toBe('network-with-full-cache');
    await fullResult.waited;
  });

  it('does not intercept POST, Supabase, sensitive routes, or Matrix Explore RPC requests', async () => {
    const worker = createWorkerHarness();
    const requests: WorkerRequest[] = [
      { url: `${origin}/api/matrix/latest/%E4%BB%8A%E5%BD%A9539`, method: 'POST' },
      { url: 'https://project.supabase.co/auth/v1/token', method: 'GET' },
      { url: `${origin}/auth/v1/token`, method: 'GET' },
      { url: `${origin}/login`, method: 'GET', mode: 'navigate', destination: 'document' },
      { url: `${origin}/member`, method: 'GET', mode: 'navigate', destination: 'document' },
      { url: `${origin}/subscription`, method: 'GET', mode: 'navigate', destination: 'document' },
      { url: `${origin}/api/member/profile`, method: 'GET' },
      { url: `${origin}/member/avatar.png`, method: 'GET', destination: 'image' },
      { url: `${origin}/api/subscription/status`, method: 'GET' },
      { url: 'https://project.supabase.co/rest/v1/rpc/matrix_explore_list', method: 'GET' },
    ];

    expect(worker.handlers.has('fetch')).toBe(true);
    for (const request of requests) {
      const result = await worker.dispatchFetch(request);
      expect(result.response).toBeUndefined();
    }
    expect(worker.cacheStorage.open).not.toHaveBeenCalled();
    expect(worker.network).not.toHaveBeenCalled();
  });

  it('cleans prior PWA cache versions without blocking activation when deletion fails', async () => {
    const worker = createWorkerHarness({ cacheDeleteFailure: true });

    await expect(worker.dispatchLifecycle('activate')).resolves.toBeUndefined();

    expect(worker.cacheStorage.delete).toHaveBeenCalledWith('matrix-pwa-shell-v0');
    expect(worker.claim).toHaveBeenCalledTimes(1);
  });
});
