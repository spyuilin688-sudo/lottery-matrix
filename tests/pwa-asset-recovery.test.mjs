import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const origin = 'https://matrix.test';
const html = (version) => `<!doctype html><html><head><link rel="stylesheet" crossorigin href="/assets/${version}.css"><script type="module" crossorigin src="/assets/${version}.js"></script></head><body>${version}</body></html>`;
const response = (body, type = 'text/html', status = 200) => new Response(body, { status, headers: { 'content-type': type } });

async function harness({ version = 'new', stores = new Map(), offline = false, brokenCss = false, cacheUnavailable = false, cachePutFailure = false } = {}) {
  const handlers = new Map();
  const requests = [];
  const key = (request) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const network = async (request) => {
    const url = key(request); requests.push(url);
    if (offline) throw new Error('offline');
    if (url.endsWith('.css')) return brokenCss ? response('<html>SPA fallback</html>') : response('body { color: gold }', 'text/css');
    if (url.endsWith('.js')) return response('window.matrix = true', 'text/javascript');
    if (url.endsWith('.png')) return response('image', 'image/png');
    if (url.endsWith('.webmanifest')) return response('{}', 'application/manifest+json');
    return response(html(version));
  };
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    open: async (name) => {
      if (cacheUnavailable) throw new Error('storage unavailable');
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        match: async (request) => entries.get(key(request))?.clone(),
        put: async (request, result) => {
          if (cachePutFailure) throw new Error('storage full');
          entries.set(key(request), result.clone());
        },
        delete: async (request) => entries.delete(key(request)),
        addAll: async (paths) => {
          const values = await Promise.all(paths.map(async p => [p, await network(p)]));
          if (values.some(([, r]) => !r.ok)) throw new Error('addAll failed');
          values.forEach(([p, r]) => entries.set(key(p), r.clone()));
        },
      };
    },
  };
  const actions = [];
  const source = (await readFile(new URL('../public/push-service-worker.js', import.meta.url), 'utf8'))
    .replaceAll('__BUILD_ID__', version)
    .replace(/const BUILD_ASSET_PATHS = .*?;/, `const BUILD_ASSET_PATHS = ["/assets/${version}.css", "/assets/${version}.js"];`);
  vm.runInNewContext(source, { URL, Request, Response, setTimeout, clearTimeout, caches, fetch: network, self: {
    location: { origin },
    addEventListener: (type, handler) => handlers.set(type, handler),
    skipWaiting: async () => actions.push('skipWaiting'),
    clients: { claim: async () => actions.push('claim'), matchAll: async () => [] },
  } });
  async function dispatch(type, request) {
    const waits = []; let result;
    handlers.get(type)({ request, waitUntil: p => waits.push(p), respondWith: p => { result = p; } });
    const resolved = result ? await result : undefined;
    await Promise.all(waits);
    return resolved;
  }
  return { stores, actions, requests, dispatch, setOffline: value => { offline = value; }, setBrokenCss: value => { brokenCss = value; } };
}
const navigation = { url: `${origin}/`, method: 'GET', mode: 'navigate', destination: 'document' };
const style = { url: `${origin}/assets/new.css`, method: 'GET', destination: 'style' };

test('installation prepares CSS and JS before the offline shell becomes usable', async () => {
  const w = await harness(); await w.dispatch('install'); await w.dispatch('activate'); w.setOffline(true);
  assert.match(await (await w.dispatch('fetch', navigation)).text(), /new/);
  assert.equal((await w.dispatch('fetch', style)).headers.get('content-type'), 'text/css');
  assert.equal((await w.dispatch('fetch', { ...style, url: `${origin}/assets/new.js`, destination: 'script' })).headers.get('content-type'), 'text/javascript');
  assert.deepEqual(w.actions, ['skipWaiting', 'claim']);
});

test('invalid CSS prevents activation of an incomplete update', async () => {
  const oldEntries = new Map([[`${origin}/`, response(html('old'))]]);
  const stores = new Map([['matrix-pwa-shell-old', oldEntries]]);
  const w = await harness({ stores, brokenCss: true });
  await assert.rejects(w.dispatch('install'));
  assert.deepEqual(w.actions, []);
  assert.equal(stores.get('matrix-pwa-shell-old'), oldEntries);
});

test('an update preserves previous-version assets needed by an open page', async () => {
  const stores = new Map([
    ['matrix-pwa-shell-obsolete', new Map()],
    ['matrix-pwa-shell-old', new Map([
      [`${origin}/`, response(html('old'))],
      [`${origin}/assets/old.css`, response('old css', 'text/css')],
      [`${origin}/assets/old.js`, response('/* old */', 'text/javascript')],
    ])],
    ['other-app-cache', new Map()],
  ]);
  const w = await harness({ stores }); await w.dispatch('install'); await w.dispatch('activate'); w.setOffline(true);
  assert.equal(await (await w.dispatch('fetch', { ...style, url: `${origin}/assets/old.css` })).text(), 'old css');
  assert.equal(stores.has('matrix-pwa-shell-obsolete'), false);
  assert.equal(stores.has('other-app-cache'), true);
});

test('cached HTML at a stylesheet URL is discarded and fetched again', async () => {
  const entries = new Map([[style.url, response('<html>wrong cached response</html>')]]);
  const w = await harness({ stores: new Map([['matrix-pwa-shell-new', entries]]) });
  const result = await w.dispatch('fetch', style);
  assert.equal(result.headers.get('content-type'), 'text/css');
  assert.equal(entries.get(style.url).headers.get('content-type'), 'text/css');
});

test('HTML returned for a stylesheet is never stored as a successful asset', async () => {
  const w = await harness({ brokenCss: true });
  await assert.rejects(w.dispatch('fetch', style));
  assert.equal(w.stores.get('matrix-pwa-shell-new')?.has(style.url), false);
});

test('navigation keeps the working shell if a new page stylesheet is unavailable', async () => {
  const old = await harness({ version: 'old' }); await old.dispatch('install');
  // The still-active worker sees a newer deployment's HTML, but its CSS is broken.
  const w = await harness({ version: 'new', stores: old.stores, brokenCss: true });
  const result = await w.dispatch('fetch', navigation);
  assert.match(await result.text(), /old/);
});

test('navigation without a complete shell shows an offline response instead of an unstyled app', async () => {
  const w = await harness({ brokenCss: true });
  assert.equal((await w.dispatch('fetch', navigation)).status, 503);
});

test('cache-unavailable registration preserves prior caches and usable network responses', async () => {
  const stores = new Map([['matrix-pwa-shell-old', new Map()]]);
  const w = await harness({ stores, cacheUnavailable: true });
  await w.dispatch('install'); await w.dispatch('activate');
  assert.equal(stores.has('matrix-pwa-shell-old'), true);
  assert.equal((await w.dispatch('fetch', style)).headers.get('content-type'), 'text/css');
  assert.deepEqual(w.actions, ['skipWaiting', 'claim']);
});

test('a failed update cannot make the following update delete the last working generation', async () => {
  const old = await harness({ version: 'old' }); await old.dispatch('install'); await old.dispatch('activate');
  const failed = await harness({ version: 'failed', stores: old.stores, brokenCss: true });
  await assert.rejects(failed.dispatch('install'));
  const next = await harness({ version: 'next', stores: old.stores }); await next.dispatch('install'); await next.dispatch('activate');
  next.setOffline(true);
  assert.equal((await next.dispatch('fetch', { ...style, url: `${origin}/assets/old.css` })).headers.get('content-type'), 'text/css');
});

test('a full cache does not block validated online navigation or delete old resources', async () => {
  const old = await harness({ version: 'old' }); await old.dispatch('install');
  const next = await harness({ stores: old.stores, cachePutFailure: true });
  await assert.rejects(next.dispatch('install'));
  assert.equal(old.stores.has('matrix-pwa-shell-old'), true);
  assert.match(await (await next.dispatch('fetch', navigation)).text(), /new/);
});
