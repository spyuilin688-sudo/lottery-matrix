// @vitest-environment jsdom
// @ts-expect-error App compilation deliberately omits Node ambient types.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

declare const process: { cwd(): string };
const html = readFileSync(`${process.cwd()}/index.html`, 'utf8');
const script = html.match(/<script id="matrix-startup-recovery">([\s\S]*?)<\/script>/)?.[1] ?? '';
const assetUrl = 'https://matrix.test/assets/app.css';

function setup({ stored = new Map<string, string>(), url = 'https://matrix.test/', hasWorker = true, storageFails = false } = {}) {
  const page = new EventTarget() as EventTarget & { location: { href: string; reload: ReturnType<typeof vi.fn> } };
  page.location = { href: url, reload: vi.fn() };
  const worker = Object.assign(new EventTarget(), {
    controller: {},
    getRegistration: vi.fn(),
    register: vi.fn(),
  });
  const registration = { installing: null, waiting: null, update: vi.fn() };
  registration.update.mockResolvedValue(registration);
  worker.getRegistration.mockResolvedValue(registration);
  const storage = {
    getItem: (key: string) => { if (storageFails) throw new Error('unavailable'); return stored.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (storageFails) throw new Error('unavailable'); stored.set(key, value); },
    removeItem: (key: string) => stored.delete(key),
  };
  const doc = document.implementation.createHTMLDocument();
  new Function('window', 'document', 'navigator', 'sessionStorage', 'setTimeout', 'clearTimeout', script)(page, doc, { serviceWorker: hasWorker ? worker : undefined, onLine: true }, storage, setTimeout, clearTimeout);
  const link = doc.createElement('link'); link.rel = 'stylesheet'; link.href = assetUrl; doc.head.append(link);
  const error = (target: Element = link) => {
    const event = new Event('error'); Object.defineProperty(event, 'target', { value: target }); page.dispatchEvent(event);
  };
  return { page, worker, registration, storage, stored, doc, link, error };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
afterEach(() => vi.useRealTimers());

describe('old installed PWA startup recovery', () => {
  it('retries the failed stylesheet after worker update without reloading the app', async () => {
    const h = setup(); h.error(); await flush();
    expect(h.registration.update).toHaveBeenCalledOnce();
    expect(new URL(h.link.href).pathname).toBe('/assets/app.css');
    expect(new URL(h.link.href).searchParams.has('matrix_asset_retry')).toBe(true);
    expect(h.page.location.reload).not.toHaveBeenCalled();
  });

  it('works without Notification or Service Worker capability', async () => {
    const h = setup({ hasWorker: false }); h.error(); await flush();
    expect(h.link.href).not.toBe(assetUrl);
    expect(h.page.location.reload).not.toHaveBeenCalled();
  });

  it('waits for the new controller before retrying a failed stylesheet', async () => {
    const h = setup(); h.registration.update.mockResolvedValue({ ...h.registration, installing: {} } as never);
    h.error(); await flush(); expect(h.link.href).toBe(assetUrl);
    h.worker.dispatchEvent(new Event('controllerchange')); await flush();
    expect(h.link.href).not.toBe(assetUrl);
  });

  it('bounds a stalled update so it cannot prevent stylesheet recovery', async () => {
    vi.useFakeTimers(); const h = setup(); h.registration.update.mockImplementation(() => new Promise(() => {}));
    h.error(); await flush(); await vi.advanceTimersByTimeAsync(5000);
    expect(h.link.href).not.toBe(assetUrl);
  });

  it('reloads at most once across consecutive broken document loads', async () => {
    const stored = new Map<string, string>();
    const first = setup({ stored }); first.error(); await flush(); first.error(); await flush();
    expect(first.page.location.reload).toHaveBeenCalledOnce();
    const second = setup({ stored }); second.error(); await flush(); second.error(); await flush();
    expect(second.page.location.reload).not.toHaveBeenCalled();
  });

  it('recovers a failed entry module without requiring React to start', async () => {
    const h = setup(); const entry = h.doc.createElement('script'); entry.type = 'module'; entry.src = 'https://matrix.test/assets/app.js';
    h.doc.head.append(entry); h.error(entry); await flush();
    expect(h.page.location.reload).toHaveBeenCalledOnce();
  });

  it.each(['?code=callback', '?matrix_line_return=attempt', '#access_token=callback'])('does not reload a LINE callback %s', async suffix => {
    const h = setup({ url: `https://matrix.test/${suffix}` }); h.error(); await flush(); h.error(); await flush();
    expect(h.link.href).not.toBe(assetUrl);
    expect(h.page.location.reload).not.toHaveBeenCalled();
  });

  it('preserves user edits when stylesheet retry still fails', async () => {
    const h = setup(); h.doc.dispatchEvent(new Event('input')); h.error(); await flush(); h.error(); await flush();
    expect(h.link.href).not.toBe(assetUrl);
    expect(h.page.location.reload).not.toHaveBeenCalled();
  });

  it('does not enter a reload loop when session storage is unavailable', async () => {
    const h = setup({ storageFails: true }); h.error(); await flush(); h.error(); await flush();
    expect(h.link.href).not.toBe(assetUrl);
    expect(h.page.location.reload).not.toHaveBeenCalled();
  });

  it('leaves healthy pages and unrelated image failures untouched', async () => {
    const h = setup(); const image = h.doc.createElement('img'); image.src = 'https://matrix.test/assets/ball.png'; h.error(image);
    await flush(); expect(h.registration.update).not.toHaveBeenCalled();
    expect(h.link.href).toBe(assetUrl); expect(h.page.location.reload).not.toHaveBeenCalled();
  });
});
