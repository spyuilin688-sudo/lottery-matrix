import { isPwaDisplayMode } from '../pwa-display-mode';

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

    if (type !== LINE_PWA_RETURN) return;
    try {
      browser.location.reload();
    } catch {
      // The PWA can still be focused by the service worker if reload is blocked.
    }
  };

  serviceWorker.addEventListener('message', handleMessage);
  try {
    const registration = await serviceWorker.ready;
    const target = serviceWorkerTarget(serviceWorker, registration.active);
    if (!target) return false;
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
    registration = await serviceWorker.ready;
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
