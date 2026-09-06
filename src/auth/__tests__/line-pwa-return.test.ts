import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasLineOAuthCallback,
  registerLinePwaClient,
  requestLinePwaReturn,
  registerLinePwaLoginAttempt,
  requestLinePwaFocus,
} from '../line-pwa-return';

const ORIGIN = 'https://matrixlottery.idv.tw';

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
        listener({ data, origin: ORIGIN } as MessageEvent);
      }
    },
    active,
  };
}

function browserWindow(url = `${ORIGIN}/`, standalone = false) {
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
    expect(hasLineOAuthCallback(browserWindow(`${ORIGIN}/?code=oauth-code`))).toBe(true);
    expect(hasLineOAuthCallback(browserWindow(`${ORIGIN}/?error=access_denied`))).toBe(true);
    expect(hasLineOAuthCallback(browserWindow(`${ORIGIN}/?matrix_line_return=attempt&code=oauth-code`))).toBe(false);
    expect(hasLineOAuthCallback(browserWindow(`${ORIGIN}/`))).toBe(false);
  });

  it('registers a standalone PWA client and navigates it to the supplied callback', async () => {
    const serviceWorker = serviceWorkerStub();
    const pwa = browserWindow(`${ORIGIN}/`, true);

    await registerLinePwaClient(pwa, serviceWorker);
    serviceWorker.emit({
      type: 'matrix-line-pwa-return',
      url: `${ORIGIN}/?code=oauth-code`,
    });

    expect(serviceWorker.controller.postMessage).toHaveBeenCalledWith({
      type: 'matrix-line-pwa-ready',
    });
    expect(pwa.location.replace).toHaveBeenCalledWith(
      `${ORIGIN}/?code=oauth-code`,
    );
  });

  it('sends a browser OAuth callback to the service worker and resolves only on a successful PWA handoff', async () => {
    const serviceWorker = serviceWorkerStub();
    const callback = browserWindow(`${ORIGIN}/?code=oauth-code`);

    const resultPromise = requestLinePwaReturn(callback, serviceWorker);
    await vi.waitFor(() => expect(serviceWorker.controller.postMessage).toHaveBeenCalledWith({
      type: 'matrix-line-pwa-return-request',
    }));

    serviceWorker.emit({ type: 'matrix-line-pwa-return-result', ok: true });

    await expect(resultPromise).resolves.toBe(true);
  });

  it('does not ask the service worker to return an ordinary page', async () => {
    const serviceWorker = serviceWorkerStub();
    const ordinaryPage = browserWindow();

    await expect(requestLinePwaReturn(ordinaryPage, serviceWorker, false)).resolves.toBe(false);
    expect(serviceWorker.controller.postMessage).not.toHaveBeenCalled();
  });

  it('registers the popup attempt with the PWA service worker before OAuth leaves', async () => {
    const serviceWorker = serviceWorkerStub();
    const pwa = browserWindow(`${ORIGIN}/`, true);
    Object.assign(pwa.navigator, { serviceWorker });
    const attemptId = '11111111-1111-4111-8111-111111111111';
    const stop = await registerLinePwaLoginAttempt(attemptId, pwa);
    expect(serviceWorker.active.postMessage).toHaveBeenCalledWith({ type: 'matrix-line-pwa-ready', attemptId });
    serviceWorker.active.postMessage.mockClear();
    serviceWorker.emit({ type: 'matrix-line-pwa-login-ping', attemptId: 'other' });
    expect(serviceWorker.active.postMessage).not.toHaveBeenCalled();
    serviceWorker.emit({ type: 'matrix-line-pwa-login-ping', attemptId });
    expect(serviceWorker.active.postMessage).toHaveBeenCalledWith({ type: 'matrix-line-pwa-ready', attemptId });
    stop?.();
    serviceWorker.active.postMessage.mockClear();
    serviceWorker.emit({ type: 'matrix-line-pwa-login-ping', attemptId });
    expect(serviceWorker.active.postMessage).not.toHaveBeenCalled();
  });

  it('asks the worker to foreground the same attempt and ignores another attempt response', async () => {
    const serviceWorker = serviceWorkerStub();
    const attemptId = '11111111-1111-4111-8111-111111111111';
    const callback = browserWindow(`${ORIGIN}/?matrix_line_return=${attemptId}#access_token=callback-token`);
    Object.assign(callback.navigator, { serviceWorker });
    const result = requestLinePwaFocus(attemptId, callback);
    await vi.waitFor(() => expect(serviceWorker.active.postMessage).toHaveBeenCalledWith({ type: 'matrix-line-pwa-focus-request', attemptId }));
    let settled = false;
    void result.then(() => { settled = true; });
    serviceWorker.emit({ type: 'matrix-line-pwa-focus-result', attemptId: 'other', ok: true });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(serviceWorker.active.postMessage).toHaveBeenCalledWith({ type: 'matrix-line-pwa-focus-request', attemptId });
    serviceWorker.emit({ type: 'matrix-line-pwa-focus-result', attemptId, ok: true });
    await expect(result).resolves.toBe(true);
  });

  it('does not hang the callback when service worker readiness never settles', async () => {
    vi.useFakeTimers();
    try {
      const serviceWorker = serviceWorkerStub();
      serviceWorker.ready = new Promise(() => {});
      const callback = browserWindow(`${ORIGIN}/?code=callback-code`);
      const result = requestLinePwaReturn(callback, serviceWorker);
      await vi.advanceTimersByTimeAsync(2_500);
      await expect(result).resolves.toBe(false);
    } finally { vi.useRealTimers(); }
  });
});
