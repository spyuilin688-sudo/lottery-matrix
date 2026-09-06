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

function pwaWindow(url = 'https://matrixlottery.idv.tw/') {
  const browser = {
    location: new URL(url),
    matchMedia: vi.fn(() => ({ matches: true })),
  } as unknown as Window;
  return browser;
}

describe('LINE PWA browser return handoff', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('recognizes a normal OAuth callback without requiring the popup correlation parameter', () => {
    expect(hasLineOAuthCallback(pwaWindow('https://matrixlottery.idv.tw/?code=oauth-code'))).toBe(true);
    expect(hasLineOAuthCallback(pwaWindow('https://matrixlottery.idv.tw/?error=access_denied'))).toBe(true);
    expect(hasLineOAuthCallback(pwaWindow('https://matrixlottery.idv.tw/?matrix_line_return=attempt'))).toBe(false);
    expect(hasLineOAuthCallback(pwaWindow('https://matrixlottery.idv.tw/'))).toBe(false);
  });

  it('registers only standalone PWA clients with the callback broker', async () => {
    const serviceWorker = serviceWorkerStub();
    const pwa = pwaWindow();

    await registerLinePwaClient(pwa, serviceWorker);

    expect(serviceWorker.controller.postMessage).toHaveBeenCalledWith({
      type: 'matrix-line-pwa-ready',
    });
  });

  it('sends a browser OAuth callback to the service worker and resolves only on a successful PWA handoff', async () => {
    const serviceWorker = serviceWorkerStub();
    const callback = pwaWindow('https://matrixlottery.idv.tw/?code=oauth-code');

    const resultPromise = requestLinePwaReturn(callback, serviceWorker);
    expect(serviceWorker.controller.postMessage).toHaveBeenCalledWith({
      type: 'matrix-line-pwa-return',
    });

    serviceWorker.emit({ type: 'matrix-line-pwa-return-result', ok: true });

    await expect(resultPromise).resolves.toBe(true);
  });

  it('does not ask the service worker to return an ordinary page', async () => {
    const serviceWorker = serviceWorkerStub();
    const ordinaryPage = pwaWindow();

    await expect(requestLinePwaReturn(ordinaryPage, serviceWorker)).resolves.toBe(false);
    expect(serviceWorker.controller.postMessage).not.toHaveBeenCalled();
  });
});
