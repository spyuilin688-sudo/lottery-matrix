const SHELL_CACHE_PREFIX = 'matrix-pwa-shell-';

type ShellAssets = { entry: string; paths: string[] };

function shellAssets(page: Document, origin: string): ShellAssets | null {
  const entries = [...page.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')];
  if (entries.length !== 1) return null;

  const elements = [
    ...entries,
    ...page.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href], link[rel="modulepreload"][href]'),
  ];
  const paths: string[] = [];
  for (const element of elements) {
    const value = element.getAttribute(element.tagName === 'SCRIPT' ? 'src' : 'href');
    if (!value) return null;
    const url = new URL(value, origin);
    if (url.origin !== origin || !url.pathname.startsWith('/assets/')) return null;
    paths.push(url.href);
  }
  if (!paths.some(path => /\.css(?:\?|$)/.test(path)) || !paths.some(path => /\.m?js(?:\?|$)/.test(path))) return null;
  return { entry: new URL(entries[0].src, origin).href, paths: [...new Set(paths)] };
}

function usableAsset(path: string, response: Response | undefined): boolean {
  if (!response?.ok) return false;
  const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (/\.css(?:\?|$)/.test(path)) return type === 'text/css';
  if (/\.m?js(?:\?|$)/.test(path)) {
    return ['text/javascript', 'application/javascript', 'application/x-javascript', 'text/ecmascript', 'application/ecmascript'].includes(type);
  }
  return false;
}

// An older controller can cache the new deployment's initial HTML before the
// replacement worker has installed all deferred chunks. Restore its last fully
// prepared shell for offline reloads; the new worker keeps its own cache.
export async function preservePreviousPwaShell({
  cacheStorage = globalThis.caches,
  page = globalThis.document,
  controller = globalThis.navigator?.serviceWorker?.controller,
}: {
  cacheStorage?: CacheStorage;
  page?: Document;
  controller?: ServiceWorker | null;
} = {}): Promise<boolean> {
  if (!controller || !cacheStorage || !page?.defaultView) return false;
  const origin = new URL(page.URL).origin;
  if (!['/', '/index.html'].includes(new URL(page.URL).pathname)) return false;
  const current = shellAssets(page, origin);
  if (!current) return false;

  const parser = new page.defaultView.DOMParser();
  for (const name of (await cacheStorage.keys()).filter(key => key.startsWith(SHELL_CACHE_PREFIX)).reverse()) {
    const cache = await cacheStorage.open(name);
    const root = await cache.match(`${origin}/`);
    if (!root?.ok || !root.headers.get('content-type')?.toLowerCase().startsWith('text/html')) continue;
    const cached = shellAssets(parser.parseFromString(await root.text(), 'text/html'), origin);
    if (cached?.entry !== current.entry) continue;

    const previous = await cache.match(`${origin}/index.html`);
    if (!previous?.ok || !previous.headers.get('content-type')?.toLowerCase().startsWith('text/html')) continue;
    const previousAssets = shellAssets(parser.parseFromString(await previous.clone().text(), 'text/html'), origin);
    if (!previousAssets || previousAssets.entry === cached.entry) continue;
    const complete = await Promise.all(previousAssets.paths.map(async path => usableAsset(path, await cache.match(path))));
    if (!complete.every(Boolean)) continue;

    await cache.put(`${origin}/`, previous.clone());
    return true;
  }
  return false;
}
