import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import jsdom from 'jsdom';
const { JSDOM, VirtualConsole, requestInterceptor } = jsdom;

const origin = 'https://matrix.test';
const html = (version) => `<!doctype html><html><head><link rel="stylesheet" crossorigin href="/assets/${version}.css"><script type="module" crossorigin src="/assets/${version}.js"></script></head><body>${version}</body></html>`;
const response = (body, type = 'text/html', status = 200) => new Response(body, { status, headers: { 'content-type': type } });

async function harness({ version = 'new', stores = new Map(), offline = false, brokenCss = false, cacheUnavailable = false, cachePutFailure = false, legacy = false } = {}) {
  const handlers = new Map();
  const requests = [];
  const key = (request) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const network = async (request) => {
    const url = key(request); requests.push(url);
    const pathname = new URL(url).pathname;
    if (offline) throw new Error('offline');
    if (pathname.endsWith('.css')) return brokenCss ? response('<html>SPA fallback</html>') : response('body { color: gold }', 'text/css');
    if (pathname.endsWith('.js')) return response('window.matrix = true', 'text/javascript');
    if (pathname.endsWith('.png')) return response('image', 'image/png');
    if (pathname.endsWith('.webmanifest')) return response('{}', 'application/manifest+json');
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
  const source = (await readFile(new URL(legacy ? './fixtures/pwa-cache-before-540.js' : '../public/push-service-worker.js', import.meta.url), 'utf8'))
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

for (const canUpdate of [true, false]) {
  test(`an old installed worker's poisoned stylesheet heals in the DOM (worker update ${canUpdate ? 'succeeds' : 'fails'})`, async () => {
    const startupHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const startup = startupHtml.match(/<script id="matrix-startup-recovery">[\s\S]*?<\/script>/)?.[0] ?? '';
    const entries = new Map([[`${origin}/assets/new.css`, response('<html>wrong cached response</html>')]]);
    const stores = new Map([['matrix-pwa-shell-old', entries]]);
    const old = await harness({ version: 'old', legacy: true, stores });
    const current = await harness({ version: 'new', stores });
    let active = old;
    const requested = [];
    const resources = { interceptors: [requestInterceptor(async request => {
      requested.push(request.url);
      const result = await active.dispatch('fetch', { url: request.url, method: 'GET', destination: 'style' });
      // jsdom parses HTML as CSS instead of enforcing stylesheet MIME, unlike
      // browsers. Enforce that response boundary; loading/events remain real DOM.
      if (result.headers.get('content-type') !== 'text/css') throw new Error('Stylesheet MIME rejected');
      return result;
    })] };
    const errors = [];
    const console = new VirtualConsole(); console.on('jsdomError', e => errors.push(e.message));
    const dom = new JSDOM(`<!doctype html><head>${startup}<link rel="stylesheet" href="/assets/new.css"></head><body>Matrix</body>`, {
      url: origin, runScripts: 'dangerously', resources, virtualConsole: console,
      beforeParse(window) {
        const serviceWorker = new window.EventTarget();
        const registration = { installing: null, waiting: null, update: async () => {
          if (!canUpdate) throw new Error('worker temporarily unavailable');
          await current.dispatch('install'); await current.dispatch('activate'); active = current;
          serviceWorker.dispatchEvent(new window.Event('controllerchange'));
          return registration;
        } };
        serviceWorker.getRegistration = async () => registration;
        serviceWorker.register = async () => registration;
        Object.defineProperty(window.navigator, 'serviceWorker', { value: serviceWorker });
        window.localStorage.setItem('member-session-fixture', 'existing-member');
      },
    });
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { clearInterval(interval); reject(new Error('stylesheet did not recover: ' + JSON.stringify({ requested, errors, href: dom.window.document.querySelector('link').href, color: dom.window.getComputedStyle(dom.window.document.body).color })));  }, 1500);
        const interval = setInterval(() => {
          if (dom.window.getComputedStyle(dom.window.document.body).color === 'rgb(255, 215, 0)') {
            clearTimeout(timeout); clearInterval(interval); resolve();
          }
        }, 10);
      });
      assert.equal(dom.window.document.styleSheets.length, 1);
      assert.equal(dom.window.localStorage.getItem('member-session-fixture'), 'existing-member');
      assert.equal(dom.window.sessionStorage.getItem('matrix-pwa-asset-reload'), null);
      assert.equal(requested.length, 2);
      assert.equal(new URL(requested[1]).searchParams.has('matrix_asset_retry'), true);
      assert.equal(errors.some(message => /navigation/i.test(message)), false);
    } finally { dom.window.close(); }
  });
}
