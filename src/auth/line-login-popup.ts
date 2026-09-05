import type { SupabaseClient } from '@supabase/supabase-js';
import { withDeadline } from '../lib/api-resilience';
import { LINE_LOGIN_ATTEMPT_TTL_MS } from './line-login-attempt';
import { rememberLineProviderToken } from './line-provider-token';

const POPUP_KEY = 'matrix-line-login-popup';
const RESULT = 'matrix-line-login-result';
const ACK = 'matrix-line-login-ack';
const CALLBACK_TIMEOUT_MS = 15_000;
const ACK_TIMEOUT_MS = 30_000;

function safely(action: () => void) {
  try { action(); } catch { /* Window handles may be severed by the browser. */ }
}

type Attempt = { id: string; startedAt: number };

function readAttempt(browser: Window): Attempt | null {
  try {
    const value = JSON.parse(browser.sessionStorage.getItem(POPUP_KEY) ?? 'null');
    const age = Date.now() - value?.startedAt;
    if (typeof value?.id === 'string' && /^[0-9a-f-]{36}$/i.test(value.id)
      && typeof value.startedAt === 'number' && age >= 0 && age < LINE_LOGIN_ATTEMPT_TTL_MS) return value;
  } catch { /* Storage can be unavailable in embedded browsers. */ }
  return null;
}

function clearAttempt(browser: Window) {
  try { browser.sessionStorage.removeItem(POPUP_KEY); } catch { /* Best effort. */ }
}

/** Called synchronously from the login click, before any OAuth await. */
export function signInWithLinePopup(
  redirectTo: string,
  client: SupabaseClient,
  browser: Window = window,
): Promise<'pwa'> | null {
  let attempt: Attempt;
  let popup: Window | null = null;
  try {
    attempt = { id: crypto.randomUUID(), startedAt: Date.now() };
    popup = browser.open('about:blank', `matrix-line-${attempt.id}`, 'popup,width=500,height=700');
    // Safari home-screen apps may not provide a script-controllable window.
    if (!popup) return null;
    popup.sessionStorage.setItem(POPUP_KEY, JSON.stringify(attempt));
  } catch {
    safely(() => popup?.close());
    return null;
  }
  const authWindow = popup;

  return new Promise((resolve, reject) => {
    let settled = false;
    let receiving = false;
    const cleanup = () => {
      browser.clearTimeout(timeout);
      browser.removeEventListener('message', receive);
      browser.removeEventListener('focus', checkClosed);
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      safely(() => authWindow.close());
      reject(new Error('LINE_LOGIN_INCOMPLETE'));
    };
    const checkClosed = () => {
      // Do not poll closed during cross-origin navigation: COOP can sever the
      // handle while the actual auth window is still open.
      safely(() => { if (authWindow.closed && !receiving) fail(); });
    };
    const receive = (event: MessageEvent) => {
      if (settled || receiving || event.origin !== browser.location.origin || event.source !== authWindow
        || event.data?.type !== RESULT || event.data?.id !== attempt.id) return;
      receiving = true;
      if (event.data.error === true) { fail(); return; }
      const { access_token, refresh_token } = event.data;
      if (typeof access_token !== 'string' || !access_token
        || typeof refresh_token !== 'string' || !refresh_token) { fail(); return; }
      browser.clearTimeout(timeout);
      // Import only the Supabase session. Keep the optional LINE revoke token
      // separately in page memory; never pass it to persisted session storage.
      void withDeadline(() => client.auth.setSession({ access_token, refresh_token }), {
        timeoutMs: CALLBACK_TIMEOUT_MS,
      }).then(({ data, error }) => {
        if (settled) return;
        if (error || !data.session) { fail(); return; }
        rememberLineProviderToken(event.data.provider_token);
        settled = true;
        cleanup();
        safely(() => authWindow.postMessage({ type: ACK, id: attempt.id }, browser.location.origin));
        safely(() => browser.focus());
        resolve('pwa');
      }).catch(fail);
    };
    const timeout = browser.setTimeout(fail, LINE_LOGIN_ATTEMPT_TTL_MS);
    browser.addEventListener('message', receive);
    browser.addEventListener('focus', checkClosed);
    void client.auth.signInWithOAuth({
      provider: 'custom:line', options: { redirectTo, skipBrowserRedirect: true },
    }).then(({ data, error }) => {
      if (settled) return;
      if (error || !data?.url) { fail(); return; }
      authWindow.location.replace(data.url);
    }).catch(fail);
  });
}

/** Run before mounting App, so a temporary callback cannot start a second presence. */
export async function finishLineLoginPopup(
  getClient: () => SupabaseClient,
  browser: Window = window,
): Promise<boolean> {
  const attempt = readAttempt(browser);
  const opener = browser.opener as Window | null;
  if (!attempt || !opener || opener.closed) {
    clearAttempt(browser);
    return false;
  }
  const params = new URLSearchParams(browser.location.hash.slice(1));
  const query = new URLSearchParams(browser.location.search);
  const authError = [params, query].some((values) => values.has('error') || values.has('error_code'));
  if (!authError && !params.has('access_token') && !query.has('code')) {
    clearAttempt(browser);
    return false;
  }

  try {
    const providerToken = params.get('provider_token');
    const session = authError ? null : await withDeadline(
      () => getClient().auth.getSession(), { timeoutMs: CALLBACK_TIMEOUT_MS },
    ).then(({ data, error }) => error ? null : data.session);
    if (session) rememberLineProviderToken(providerToken);
    clearAttempt(browser);
    return await new Promise<boolean>((resolve) => {
      const cleanup = () => {
        browser.clearTimeout(timeout);
        browser.removeEventListener('message', receive);
      };
      const receive = (event: MessageEvent) => {
        if (event.origin !== browser.location.origin || event.source !== opener
          || event.data?.type !== ACK || event.data?.id !== attempt.id) return;
        cleanup();
        safely(() => opener.focus());
        safely(() => browser.close());
        let closed = false;
        safely(() => { closed = browser.closed; });
        resolve(closed);
      };
      const timeout = browser.setTimeout(() => { cleanup(); resolve(false); }, ACK_TIMEOUT_MS);
      browser.addEventListener('message', receive);
      try {
        opener.postMessage(session ? {
          type: RESULT, id: attempt.id,
          access_token: session.access_token, refresh_token: session.refresh_token,
          ...(providerToken ? { provider_token: providerToken } : {}),
        } : { type: RESULT, id: attempt.id, error: true }, browser.location.origin);
      } catch {
        cleanup();
        resolve(false);
      }
    });
  } catch {
    clearAttempt(browser);
    // A browser or native LINE handoff can lose its opener. Let the normal app
    // initialize the callback rather than trapping the user on a blank page.
    return false;
  }
}
