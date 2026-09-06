import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasLineOAuthCallback,
  registerLinePwaClient,
  requestLinePwaReturn,
} from '../line-pwa-return';

function serviceWorkerStub() {
  const messageListeners = new Set<(event: MessageEvent) => void>();
  const active = { postMessage: vi.fn() };
  const registration = { active };

  return {
    ready: Promise.resolve(registration),
    controller: active,
    addEventListener: vi.fn((type: string, listener: (event: MessageEvent) => void) => {
      if (type === 'message') messageListeners.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: (event: MessageEvent) => void) => {
      if (type === 'message') messageListeners.delete(listener);
    }),
    emit(data: unknown) {
      for (const listener of [...messageListeners]) {
        listener(new MessageEvent('message', { data, origin: window.location.origin }));
      }
    },
    active,
  };
}

function browserWindow(url = 'https://matrixlottery.idv.tw/', standalone = false) {
  const location = Object.assign(new URL(url), { replace: vi.fn() });
  return {
    location,
    matchMedia: vi.fn((query: string) => ({ matches: standalone && query === '(display-mode: standalone)' })),
    setTimeout,
    clearTimeout,
    navigator: {
      userAgent: standalone ? 'Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile' : 'Mozilla/5.0 (X11; Linux x86_64)',
      platform: 'Linux',
      maxTouchPoints: standalone ? 5 : 0,
    },
  } as unknown as Window;
}

describe('LINE PWA browser return handoff', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('recognizes a normal OAuth callback without requiring the popup correlation parameter', () => {
    expect(hasLineOAuthCallback(browserWindow('https://matrixlottery.idv.tw/?code=oauth-code'))).toBe(true);
    expect(hasLineOAuthCallback(browserWindow('https://matrixlottery.idv.tw/?error=access_denied'))).toBe(true);
    expect(hasLineOAuthCallback(browserWindow('https://matrixlottery.idv.tw/?matrix_line_return=attempt&code=oauth-code'))).toBe(false);
    expect(hasLineOAuthCallback(browserWindow('https://matrixlottery.idv.tw/'))).toBe(false);
  });

  it('registers a standalone PWA client and navigates it to the supplied callback', async () => {
    const serviceWorker = serviceWorkerStub();
    const pwa = browserWindow('https://matrixlottery.idv.tw/', true);

    await registerLinePwaClient(pwa, serviceWorker);
    serviceWorker.emit({
      type: 'matrix-line-pwa-return',
      url: 'https://matrixlottery.idv.tw/?code=oauth-code',
    });

    expect(serviceWorker.controller.postMessage).toHaveBeenCalledWith({
      type: 'matrix-line-pwa-ready',
    });
    expect(pwa.location.replace).toHaveBeenCalledWith(
      'https://matrixlottery.idv.tw/?code=oauth-code',
    );
  });

  it('sends a browser OAuth callback to the service worker and resolves only on a successful PWA handoff', async () => {
    const serviceWorker = serviceWorkerStub();
    const callback = browserWindow('https://matrixlottery.idv.tw/?code=oauth-code');

    const resultPromise = requestLinePwaReturn(callback, serviceWorker);
    await Promise.resolve();
    expect(serviceWorker.controller.postMessage).toHaveBeenCalledWith({
      type: 'matrix-line-pwa-return-request',
    });

    serviceWorker.emit({ type: 'matrix-line-pwa-return-result', ok: true });

    await expect(resultPromise).resolves.toBe(true);
  });

  it('does not ask the service worker to return an ordinary page', async () => {
    const serviceWorker = serviceWorkerStub();
    const ordinaryPage = browserWindow();

    await expect(requestLinePwaReturn(ordinaryPage, serviceWorker, false)).resolves.toBe(false);
    expect(serviceWorker.controller.postMessage).not.toHaveBeenCalled();
  });
});
