import { isPwaDisplayMode } from '../pwa-display-mode';
import { withDeadline } from '../lib/api-resilience';

export const LINE_PWA_READY = 'matrix-line-pwa-ready';
export const LINE_PWA_PING = 'matrix-line-pwa-ping';
export const LINE_PWA_IDENTIFIED = 'matrix-line-pwa-identified';
export const LINE_PWA_RETURN_REQUEST = 'matrix-line-pwa-return-request';
export const LINE_PWA_RETURN = 'matrix-line-pwa-return';
export const LINE_PWA_RETURN_RESULT = 'matrix-line-pwa-return-result';

const HANDOFF_TIMEOUT_MS = 2_500;

type LineServiceWorkerBridge = {
  ready: Promise<{
    active: { postMessage: (message: unknown) => void } | null;
  }>;
  controller: { postMessage: (message: unknown) => void } | null;
  addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  removeEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
};

function serviceWorkerTarget(
  serviceWorker: LineServiceWorkerBridge,
  active: { postMessage: (message: unknown) => void } | null,
) {
  return active ?? serviceWorker.controller;
}

export function hasLineOAuthCallback(browser: Pick<Window, 'location'> = window) {
  const query = new URLSearchParams(browser.location.search);
  if (query.has('matrix_line_return')) return false;

  const hash = new URLSearchParams(browser.location.hash.replace(/^#/, ''));
  return [query, hash].some((params) =>
    params.has('code')
    || params.has('error')
    || params.has('error_code')
    || params.has('access_token'),
  );
}

export async function registerLinePwaClient(
  browser: Window = window,
  serviceWorker: LineServiceWorkerBridge = navigator.serviceWorker,
) {
  if (!isPwaDisplayMode(browser)) return false;

  const handleMessage = (event: MessageEvent) => {
    const type = event.data?.type;
    if (type === LINE_PWA_PING) {
      const target = serviceWorker.controller;
      if (target) {
        try {
          target.postMessage({ type: LINE_PWA_IDENTIFIED, requestId: event.data.requestId });
        } catch {
          // A worker update can sever the current controller between events.
        }
      }
      return;
    }

    if (type !== LINE_PWA_RETURN || typeof event.data?.url !== 'string') return;
    try {
      const callbackUrl = new URL(event.data.url, browser.location.origin);
      if (callbackUrl.origin !== browser.location.origin) return;
      try { browser.focus(); } catch { /* Best effort; browser may deny focus. */ }
      if (browser.location.href !== callbackUrl.href) {
        browser.location.replace(callbackUrl.href);
      }
    } catch {
      // The service worker can still navigate/focus the PWA directly.
    }
  };

  serviceWorker.addEventListener('message', handleMessage);
  try {
    const registration = await serviceWorker.ready;
    const target = serviceWorkerTarget(serviceWorker, registration.active);
    if (!target) {
      serviceWorker.removeEventListener('message', handleMessage);
      return false;
    }
    target.postMessage({ type: LINE_PWA_READY });
    return true;
  } catch {
    serviceWorker.removeEventListener('message', handleMessage);
    return false;
  }
}

export async function requestLinePwaReturn(
  browser: Window = window,
  serviceWorker: LineServiceWorkerBridge = navigator.serviceWorker,
  callbackDetected = hasLineOAuthCallback(browser),
) {
  if (isPwaDisplayMode(browser) || !callbackDetected) return false;

  let registration: Awaited<LineServiceWorkerBridge['ready']>;
  try {
    registration = await withDeadline(() => serviceWorker.ready, { timeoutMs: HANDOFF_TIMEOUT_MS });
  } catch {
    return false;
  }

  const target = serviceWorkerTarget(serviceWorker, registration.active);
  if (!target) return false;

  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const timeout = browser.setTimeout(() => finish(false), HANDOFF_TIMEOUT_MS);
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      browser.clearTimeout(timeout);
      serviceWorker.removeEventListener('message', receive);
      resolve(ok);
    };
    const receive = (event: MessageEvent) => {
      if (event.data?.type !== LINE_PWA_RETURN_RESULT) return;
      finish(event.data.ok === true);
    };

    serviceWorker.addEventListener('message', receive);
    try {
      target.postMessage({ type: LINE_PWA_RETURN_REQUEST });
    } catch {
      finish(false);
    }
  });
}

export async function registerLinePwaLoginAttempt(attemptId: string, browser: Window = window) {
  const serviceWorker = browser.navigator?.serviceWorker;
  if (!serviceWorker) return;
  const receive = (event: MessageEvent) => {
    if (event.data?.type !== 'matrix-line-pwa-login-ping' || event.data.attemptId !== attemptId) return;
    try { serviceWorker.controller?.postMessage({ type: LINE_PWA_READY, attemptId }); }
    catch { /* The next worker probe can retry after a controller change. */ }
  };
  serviceWorker.addEventListener('message', receive);
  try {
    const registration = await withDeadline(() => serviceWorker.ready, { timeoutMs: HANDOFF_TIMEOUT_MS });
    serviceWorkerTarget(serviceWorker, registration.active)?.postMessage({ type: LINE_PWA_READY, attemptId });
  } catch { /* Existing popup messaging remains available when the worker is unavailable. */ }
  return () => serviceWorker.removeEventListener('message', receive);
}

export async function requestLinePwaFocus(attemptId: string, browser: Window = window): Promise<boolean> {
  const serviceWorker = browser.navigator?.serviceWorker;
  if (!serviceWorker) return false;
  let target: ServiceWorker | null;
  try {
    const registration = await withDeadline(() => serviceWorker.ready, { timeoutMs: HANDOFF_TIMEOUT_MS });
    target = registration.active ?? serviceWorker.controller;
  } catch { return false; }
  if (!target) return false;
  return new Promise((resolve) => {
    const finish = (ok: boolean) => {
      browser.clearTimeout(timeout);
      serviceWorker.removeEventListener('message', receive);
      resolve(ok);
    };
    const receive = (event: MessageEvent) => {
      if (event.data?.type === 'matrix-line-pwa-focus-result' && event.data.attemptId === attemptId) finish(event.data.ok === true);
    };
    const timeout = browser.setTimeout(() => finish(false), HANDOFF_TIMEOUT_MS);
    serviceWorker.addEventListener('message', receive);
    try { target.postMessage({ type: 'matrix-line-pwa-focus-request', attemptId }); }
    catch { finish(false); }
  });
}
