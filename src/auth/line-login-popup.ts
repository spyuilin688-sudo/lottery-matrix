import type { SupabaseClient } from '@supabase/supabase-js';
import { withDeadline } from '../lib/api-resilience';
import { LINE_LOGIN_ATTEMPT_TTL_MS } from './line-login-attempt';
import { rememberLineProviderToken } from './line-provider-token';

const POPUP_KEY = 'matrix-line-login-popup';
const RESULT = 'matrix-line-login-result';
const ACK = 'matrix-line-login-ack';
const PING = 'matrix-line-login-ping';
const PONG = 'matrix-line-login-pong';
const PEER_TIMEOUT_MS = 2_500;
const CALLBACK_TIMEOUT_MS = 15_000;
const ACK_TIMEOUT_MS = 30_000;
const RETURN_ATTEMPT_PARAM = 'matrix_line_return';

function safely(action: () => void) {
  try { action(); } catch { /* Window handles may be severed by the browser. */ }
}

type Attempt = { id: string; startedAt: number };

function validAttempt(value: unknown): value is Attempt {
  if (!value || typeof value !== 'object') return false;
  const attempt = value as Partial<Attempt>;
  const age = Date.now() - (attempt.startedAt ?? Number.NaN);
  return typeof attempt.id === 'string' && /^[0-9a-f-]{36}$/i.test(attempt.id)
    && typeof attempt.startedAt === 'number' && age >= 0 && age < LINE_LOGIN_ATTEMPT_TTL_MS;
}

function openReturnChannel(browser: Window, attempt: Attempt): BroadcastChannel | null {
  try {
    const Channel = (browser as Window & { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
    return Channel ? new Channel(`matrix-line-return-${attempt.id}`) : null;
  } catch { return null; }
}

function hasReturnPeer(browser: Window, channel: BroadcastChannel, attempt: Attempt): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (ready: boolean) => {
      browser.clearTimeout(timeout);
      channel.removeEventListener('message', receive);
      resolve(ready);
    };
    const receive = (event: MessageEvent) => {
      if (event.origin === browser.location.origin && event.data?.type === PONG
        && event.data?.id === attempt.id) finish(true);
    };
    const timeout = browser.setTimeout(() => finish(false), PEER_TIMEOUT_MS);
    channel.addEventListener('message', receive);
    try { channel.postMessage({ type: PING, id: attempt.id }); }
    catch { finish(false); }
  });
}

function readAttempt(browser: Window): Attempt | null {
  try {
    const value = JSON.parse(browser.sessionStorage.getItem(POPUP_KEY) ?? 'null');
    if (validAttempt(value)) return value;
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
  const channel = openReturnChannel(browser, attempt);
  const callbackUrl = new URL(redirectTo);
  // The destination stays at the approved origin root. This internally-created
  // ID binds a callback from a fresh LINE tab to this exact waiting PWA attempt.
  callbackUrl.searchParams.set(RETURN_ATTEMPT_PARAM, attempt.id);

  return new Promise((resolve, reject) => {
    let settled = false;
    let receiving = false;
    let closedTimeout: number | undefined;
    const cleanup = () => {
      browser.clearTimeout(timeout);
      browser.clearTimeout(closedTimeout);
      browser.removeEventListener('message', receive);
      browser.removeEventListener('focus', checkClosed);
      channel?.close();
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
      safely(() => {
        if (!authWindow.closed || receiving || settled) return;
        if (!channel) { fail(); return; }
        // Native LINE/COOP may sever the old handle while its new callback tab
        // is still loading. Give the return channel time to finish that handoff.
        closedTimeout ??= browser.setTimeout(fail, CALLBACK_TIMEOUT_MS);
      });
    };
    const acceptResult = (event: MessageEvent, viaChannel: boolean) => {
      if (settled || receiving || event.origin !== browser.location.origin || (!viaChannel && event.source !== authWindow)
        || event.data?.type !== RESULT || event.data?.id !== attempt.id) return;
      receiving = true;
      browser.clearTimeout(closedTimeout);
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
        const ack = { type: ACK, id: attempt.id };
        if (viaChannel) safely(() => channel?.postMessage(ack));
        else safely(() => authWindow.postMessage(ack, browser.location.origin));
        // A detached native callback otherwise leaves the original OAuth window
        // underneath it. Close that script-owned window after accepting the session.
        if (viaChannel) safely(() => authWindow.close());
        cleanup();
        safely(() => browser.focus());
        resolve('pwa');
      }).catch(fail);
    };
    const receive = (event: MessageEvent) => acceptResult(event, false);
    const timeout = browser.setTimeout(fail, LINE_LOGIN_ATTEMPT_TTL_MS);
    browser.addEventListener('message', receive);
    browser.addEventListener('focus', checkClosed);
    channel?.addEventListener('message', (event) => {
      if (!settled && event.origin === browser.location.origin && event.data?.type === PING
        && event.data?.id === attempt.id) {
        safely(() => channel.postMessage({ type: PONG, id: attempt.id }));
        return;
      }
      acceptResult(event, true);
    });
    void client.auth.signInWithOAuth({
      provider: 'custom:line', options: { redirectTo: callbackUrl.href, skipBrowserRedirect: true },
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
  const query = new URLSearchParams(browser.location.search);
  const callbackIds = query.getAll(RETURN_ATTEMPT_PARAM);
  const storedAttempt = readAttempt(browser);
  const callbackAttempt = callbackIds.length === 1
    ? { id: callbackIds[0], startedAt: Date.now() } : null;
  const attempt = callbackIds.length === 0 ? storedAttempt
    : validAttempt(callbackAttempt) && (!storedAttempt || storedAttempt.id === callbackAttempt.id)
      ? callbackAttempt : null;
  if (!attempt) {
    clearAttempt(browser);
    return false;
  }
  const params = new URLSearchParams(browser.location.hash.slice(1));
  const authError = [params, query].some((values) => values.has('error') || values.has('error_code'));
  if (!authError && !params.has('access_token') && !query.has('code')) {
    clearAttempt(browser);
    return false;
  }
  let opener: Window | null = null;
  safely(() => { if (browser.opener && !browser.opener.closed) opener = browser.opener; });
  const channel = openReturnChannel(browser, attempt);
  if (!opener && !channel) {
    clearAttempt(browser);
    return false;
  }

  try {
    if (!opener && channel && !await hasReturnPeer(browser, channel, attempt)) {
      channel.close();
      clearAttempt(browser);
      return false;
    }
    const providerToken = params.get('provider_token');
    const session = authError ? null : await withDeadline(async () => {
      if (!params.has('access_token')) return getClient().auth.getSession();
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (!access_token || !refresh_token) return { data: { session: null }, error: null };
      // Auth's implicit-URL parser clears location.hash by navigating, adding a
      // second history entry. A fresh tab opened by native LINE then loses its
      // script-close eligibility. Replace the URL before creating the client,
      // and let setSession validate/import the captured tokens without navigation.
      browser.history.replaceState(browser.history.state, '', `${browser.location.pathname}${browser.location.search}`);
      return getClient().auth.setSession({ access_token, refresh_token });
    }, { timeoutMs: CALLBACK_TIMEOUT_MS }).then(({ data, error }) => error ? null : data.session);
    if (session) rememberLineProviderToken(providerToken);
    clearAttempt(browser);
    return await new Promise<boolean>((resolve) => {
      const cleanup = () => {
        browser.clearTimeout(timeout);
        browser.removeEventListener('message', receive);
        channel?.close();
      };
      const acceptAck = (event: MessageEvent, viaChannel: boolean) => {
        if (event.origin !== browser.location.origin || (!viaChannel && event.source !== opener)
          || event.data?.type !== ACK || event.data?.id !== attempt.id) return;
        cleanup();
        safely(() => opener?.focus());
        safely(() => browser.close());
        let closed = false;
        safely(() => { closed = browser.closed; });
        resolve(closed);
      };
      const receive = (event: MessageEvent) => acceptAck(event, false);
      const timeout = browser.setTimeout(() => { cleanup(); resolve(false); }, ACK_TIMEOUT_MS);
      browser.addEventListener('message', receive);
      channel?.addEventListener('message', (event) => acceptAck(event, true));
      const result = session ? {
        type: RESULT, id: attempt.id,
        access_token: session.access_token, refresh_token: session.refresh_token,
        ...(providerToken ? { provider_token: providerToken } : {}),
      } : { type: RESULT, id: attempt.id, error: true };
      let sent = false;
      safely(() => { if (opener) { opener.postMessage(result, browser.location.origin); sent = true; } });
      safely(() => { if (channel) { channel.postMessage(result); sent = true; } });
      if (!sent) {
        cleanup();
        resolve(false);
      }
    });
  } catch {
    channel?.close();
    clearAttempt(browser);
    // A browser or native LINE handoff can lose its opener. Let the normal app
    // initialize the callback rather than trapping the user on a blank page.
    return false;
  }
}
