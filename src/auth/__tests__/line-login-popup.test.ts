// @vitest-environment jsdom
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finishLineLoginPopup, signInWithLinePopup } from '../line-login-popup';
import { LINE_LOGIN_ATTEMPT_TTL_MS } from '../line-login-attempt';
import { clearLineAuthEphemeralState, readLineProviderToken } from '../line-provider-token';

const origin = 'https://matrixlottery.idv.tw';
const session = { access_token: 'supabase-access', refresh_token: 'supabase-refresh' };
function browserWindow() {
  const storage = new Map<string, string>();
  const location = { origin, pathname: '/', hash: '', search: '', replace: vi.fn() };
  return Object.assign(new EventTarget(), {
    location,
    history: { state: null, replaceState: vi.fn(() => { location.hash = ''; }) },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    },
    opener: null as unknown,
    closed: false,
    open: vi.fn(), close: vi.fn(), focus: vi.fn(), postMessage: vi.fn(),
    setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window),
  });
}
function setup() {
  const parent = browserWindow();
  const popup = browserWindow();
  popup.close.mockImplementation(() => { popup.closed = true; });
  parent.open.mockReturnValue(popup);
  popup.opener = parent;
  const auth = {
    signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: 'https://auth.example/authorize' }, error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    setSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
  };
  const client = { auth } as unknown as SupabaseClient;
  const callbackClient = { auth: { ...auth,
    setSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
  } } as unknown as SupabaseClient;
  const send = (target: typeof parent, source: typeof parent, data: unknown, from = origin) => {
    target.dispatchEvent(new MessageEvent('message', { data, origin: from, source: source as unknown as Window }));
  };
  popup.postMessage.mockImplementation((data) => send(popup, parent, data));
  parent.postMessage.mockImplementation((data) => send(parent, popup, data));
  const start = () => signInWithLinePopup(`${origin}/`, client, parent as unknown as Window)!;
  const callback = () => finishLineLoginPopup(() => callbackClient, popup as unknown as Window);
  const result = () => ({ type: 'matrix-line-login-result',
    id: JSON.parse(popup.sessionStorage.getItem('matrix-line-login-popup')!).id, ...session });
  return { parent, popup, auth, client: callbackClient, send, start, callback, result };
}

function connectBrowserChannels(...windows: ReturnType<typeof browserWindow>[]) {
  const storage = new Map<string, string>();
  const channels = new Set<BrowserChannel>();
  class BrowserChannel extends EventTarget {
    closed = false;
    constructor(readonly name: string) { super(); channels.add(this); }
    postMessage(data: unknown) {
      if (this.closed) throw new Error('channel closed');
      for (const channel of channels) {
        if (channel !== this && channel.name === this.name && !channel.closed) {
          queueMicrotask(() => {
            if (!channel.closed) channel.dispatchEvent(new MessageEvent('message', { data, origin }));
          });
        }
      }
    }
    close() { this.closed = true; channels.delete(this); }
  }
  for (const browser of windows) Object.assign(browser, {
    BroadcastChannel: BrowserChannel,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    },
  });
  return { storage, channels, BrowserChannel };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); clearLineAuthEphemeralState(); });

describe('installed PWA LINE login return', () => {
  it('keeps a native callback at one history entry while the installed Auth client accepts its session', async () => {
    vi.useRealTimers();
    const previousUrl = window.location.href;
    const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated',
      role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-09-06T00:00:00Z' };
    const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id,
      exp: Math.floor(Date.now() / 1000) + 3600 })}.${btoa('test-signature').replace(/=/g, '')}`;
    const id = crypto.randomUUID();
    window.history.replaceState(null, '', `/?matrix_line_return=${id}#${new URLSearchParams({
      access_token: token, refresh_token: 'callback-refresh', expires_in: '3600',
      token_type: 'bearer', provider_token: 'line-memory-only',
    })}`);
    const initialHistoryLength = window.history.length;
    let importedTokens: unknown;
    const parent = { closed: false, focus: vi.fn(), postMessage: (data: Record<string, unknown>) => {
      importedTokens = data;
      window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin,
        source: parent as unknown as Window, data: { type: 'matrix-line-login-ack', id } }));
    } };
    vi.stubGlobal('opener', parent);
    vi.stubGlobal('closed', false);
    // Model the non-script-opened tab close rule; the actual Auth client and
    // jsdom History/Location operations remain real so hash navigation is visible.
    vi.spyOn(window, 'close').mockImplementation(() => {
      if (window.history.length === initialHistoryLength) vi.stubGlobal('closed', true);
    });
    let client: SupabaseClient | undefined;
    const getClient = () => client ??= createClient('https://auth.example', 'test-publishable-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: true,
        lock: async (_name, _timeout, action) => action() },
      global: { fetch: async () => new Response(JSON.stringify(user), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }) },
    });
    try {
      const handled = await finishLineLoginPopup(getClient, window);
      expect(window.history.length).toBe(initialHistoryLength);
      expect(handled).toBe(true);
      expect(window.location.hash).toBe('');
      expect(importedTokens).toMatchObject({ access_token: token, refresh_token: 'callback-refresh' });
      expect(readLineProviderToken()).toBe('line-memory-only');
    } finally {
      await client?.auth.stopAutoRefresh();
      vi.unstubAllGlobals();
      window.history.replaceState(null, '', previousUrl);
    }
  });

  it('returns a LINE callback opened in a different browser tab to the waiting PWA', async () => {
    const { parent, popup, auth, start, client } = setup();
    const returnedTab = browserWindow();
    returnedTab.close.mockImplementation(() => { returnedTab.closed = true; });
    const { storage, channels } = connectBrowserChannels(parent, popup, returnedTab);
    const serviceWorker = new EventTarget();
    const activeWorker = { postMessage: vi.fn((data: Record<string, unknown>) => {
      if (data.type === 'matrix-line-pwa-focus-request') {
        serviceWorker.dispatchEvent(new MessageEvent('message', {
          data: { type: 'matrix-line-pwa-focus-result', attemptId: data.attemptId, ok: true },
        }));
      }
    }) };
    Object.assign(serviceWorker, { controller: activeWorker, ready: Promise.resolve({ active: activeWorker }) });
    Object.assign(parent, { navigator: { serviceWorker } });
    Object.assign(returnedTab, { navigator: { serviceWorker } });
    const login = start();
    await vi.advanceTimersByTimeAsync(0);
    // A native LINE handoff opens a fresh tab: neither opener nor sessionStorage survives.
    const id = JSON.parse(popup.sessionStorage.getItem('matrix-line-login-popup')!).id;
    expect(activeWorker.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'matrix-line-pwa-ready', attemptId: id });
    expect(popup.location.replace).toHaveBeenCalledWith('https://auth.example/authorize');
    returnedTab.location.search = `?matrix_line_return=${id}`;
    returnedTab.location.hash = '#access_token=callback-token&refresh_token=callback-refresh&provider_token=line-revoke-only';
    const finish = finishLineLoginPopup(() => client, returnedTab as unknown as Window);
    await vi.advanceTimersByTimeAsync(0);
    expect(auth.setSession).toHaveBeenCalledExactlyOnceWith(session);
    expect(activeWorker.postMessage).toHaveBeenCalledWith({ type: 'matrix-line-pwa-focus-request', attemptId: id });
    await expect(login).resolves.toBe('pwa');
    await expect(finish).resolves.toBe(true);
    expect(parent.focus).toHaveBeenCalled();
    expect(returnedTab.close).toHaveBeenCalledOnce();
    expect(popup.close).toHaveBeenCalledOnce();
    expect(parent.close).not.toHaveBeenCalled();
    expect(readLineProviderToken()).toBe('line-revoke-only');
    expect([...storage.values()].join('')).not.toContain('supabase-access');
    expect([...storage.values()].join('')).not.toContain('line-revoke-only');
    expect(channels.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('imports a detached native callback even when foreground activation is refused', async () => {
    const { parent, popup, auth, start, client } = setup();
    const returnedTab = browserWindow();
    connectBrowserChannels(parent, popup, returnedTab);
    parent.focus.mockImplementation(() => { throw new DOMException('blocked', 'InvalidAccessError'); });
    const serviceWorker = Object.assign(new EventTarget(), {
      ready: Promise.resolve({ active: { postMessage: (data: { attemptId: string }) => {
        queueMicrotask(() => serviceWorker.dispatchEvent(new MessageEvent('message', {
          data: { type: 'matrix-line-pwa-focus-result', attemptId: data.attemptId, ok: false },
        })));
      } } }),
    });
    Object.assign(returnedTab, { navigator: { serviceWorker } });
    const login = start();
    const id = JSON.parse(popup.sessionStorage.getItem('matrix-line-login-popup')!).id;
    returnedTab.location.search = `?matrix_line_return=${id}`;
    returnedTab.location.hash = '#access_token=callback-token&refresh_token=callback-refresh';
    // The OS refuses to close this native-created tab. Session delivery must
    // still succeed, without claiming that the native PWA became foreground.
    const finish = finishLineLoginPopup(() => client, returnedTab as unknown as Window);
    await vi.advanceTimersByTimeAsync(0);
    await expect(login).resolves.toBe('pwa');
    await expect(finish).resolves.toBe(false);
    expect(auth.setSession).toHaveBeenCalledExactlyOnceWith(session);
    expect(parent.close).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not broadcast or close a normal tab that has no OAuth callback', async () => {
    const { parent, popup, auth, start, client } = setup();
    const otherTab = browserWindow();
    connectBrowserChannels(parent, popup, otherTab);
    const rejected = expect(start()).rejects.toThrow('LINE_LOGIN_INCOMPLETE');
    await expect(finishLineLoginPopup(() => client, otherTab as unknown as Window)).resolves.toBe(false);
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(otherTab.close).not.toHaveBeenCalled();
    popup.closed = true;
    parent.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
  });

  it('does not trust a channel message with a different origin or attempt ID', async () => {
    const { parent, popup, auth, start } = setup();
    const { channels } = connectBrowserChannels(parent, popup);
    const rejected = expect(start()).rejects.toThrow('LINE_LOGIN_INCOMPLETE');
    expect(channels.size).toBe(1);
    const channel = [...channels][0];
    const id = JSON.parse(popup.sessionStorage.getItem('matrix-line-login-popup')!).id;
    channel.dispatchEvent(new MessageEvent('message', {
      origin: 'https://other.example', data: { type: 'matrix-line-login-result', id, ...session },
    }));
    channel.dispatchEvent(new MessageEvent('message', {
      origin, data: { type: 'matrix-line-login-result', id: crypto.randomUUID(), ...session },
    }));
    expect(auth.setSession).not.toHaveBeenCalled();
    popup.closed = true;
    parent.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(channels.size).toBe(0);
  });

  it('cannot resume a completed or expired shared return attempt', async () => {
    const { parent, popup, auth, start, client } = setup();
    const returnedTab = browserWindow();
    const { channels } = connectBrowserChannels(parent, popup, returnedTab);
    const rejected = expect(start()).rejects.toThrow('LINE_LOGIN_INCOMPLETE');
    const id = JSON.parse(popup.sessionStorage.getItem('matrix-line-login-popup')!).id;
    await vi.advanceTimersByTimeAsync(LINE_LOGIN_ATTEMPT_TTL_MS);
    await rejected;
    returnedTab.location.hash = '#access_token=late-token&refresh_token=callback-refresh';
    returnedTab.location.search = `?matrix_line_return=${id}`;
    const finish = finishLineLoginPopup(() => client, returnedTab as unknown as Window);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(finish).resolves.toBe(false);
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(returnedTab.close).not.toHaveBeenCalled();
    expect(channels.size).toBe(0);
  });

  it('waits for a detached callback when native navigation severs the old window handle', async () => {
    const { parent, popup, auth, start, client } = setup();
    const returnedTab = browserWindow();
    returnedTab.close.mockImplementation(() => { returnedTab.closed = true; });
    connectBrowserChannels(parent, popup, returnedTab);
    const login = start();
    const id = JSON.parse(popup.sessionStorage.getItem('matrix-line-login-popup')!).id;
    popup.closed = true;
    parent.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(1_000);
    returnedTab.location.hash = '#access_token=callback-token&refresh_token=callback-refresh';
    returnedTab.location.search = `?matrix_line_return=${id}`;
    const finish = finishLineLoginPopup(() => client, returnedTab as unknown as Window);
    await vi.advanceTimersByTimeAsync(0);
    await expect(login).resolves.toBe('pwa');
    await expect(finish).resolves.toBe(true);
    expect(auth.setSession).toHaveBeenCalledExactlyOnceWith(session);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not assign a detached callback to one of several overlapping login attempts', async () => {
    const first = setup();
    const second = setup();
    const returnedTab = browserWindow();
    connectBrowserChannels(first.parent, first.popup, second.parent, second.popup, returnedTab);
    const rejectedFirst = expect(first.start()).rejects.toThrow('LINE_LOGIN_INCOMPLETE');
    const rejectedSecond = expect(second.start()).rejects.toThrow('LINE_LOGIN_INCOMPLETE');
    returnedTab.location.hash = '#access_token=ambiguous-callback&refresh_token=callback-refresh';
    await expect(finishLineLoginPopup(() => first.client, returnedTab as unknown as Window)).resolves.toBe(false);
    expect(first.auth.setSession).not.toHaveBeenCalled();
    expect(second.auth.setSession).not.toHaveBeenCalled();
    first.popup.closed = true;
    first.parent.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(15_000);
    await rejectedFirst;
    // Removing one overlapping attempt must not make the other appear unambiguous.
    await expect(finishLineLoginPopup(() => second.client, returnedTab as unknown as Window)).resolves.toBe(false);
    await vi.advanceTimersByTimeAsync(LINE_LOGIN_ATTEMPT_TTL_MS);
    await rejectedSecond;
  });

  it('does not attach a late callback from attempt A to a newer attempt B', async () => {
    const first = setup();
    const second = setup();
    const returnedTab = browserWindow();
    connectBrowserChannels(first.parent, first.popup, second.parent, second.popup, returnedTab);
    const rejectedFirst = expect(first.start()).rejects.toThrow('LINE_LOGIN_INCOMPLETE');
    const oldId = JSON.parse(first.popup.sessionStorage.getItem('matrix-line-login-popup')!).id;
    await vi.advanceTimersByTimeAsync(LINE_LOGIN_ATTEMPT_TTL_MS);
    await rejectedFirst;
    const rejectedSecond = expect(second.start()).rejects.toThrow('LINE_LOGIN_INCOMPLETE');
    returnedTab.location.search = `?matrix_line_return=${oldId}`;
    returnedTab.location.hash = '#access_token=old-callback&refresh_token=callback-refresh';
    const finish = finishLineLoginPopup(() => first.client, returnedTab as unknown as Window);
    await vi.advanceTimersByTimeAsync(2_500);
    await expect(finish).resolves.toBe(false);
    expect(first.auth.getSession).not.toHaveBeenCalled();
    expect(second.auth.setSession).not.toHaveBeenCalled();
    expect(returnedTab.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(LINE_LOGIN_ATTEMPT_TTL_MS);
    await rejectedSecond;
  });

  it('falls back promptly without consuming the callback when browser partitions cannot communicate', async () => {
    const { parent, popup, client, start, auth } = setup();
    const returnedTab = browserWindow();
    connectBrowserChannels(parent, popup);
    connectBrowserChannels(returnedTab); // Separate browser/PWA storage partition.
    const rejected = expect(start()).rejects.toThrow('LINE_LOGIN_INCOMPLETE');
    const id = JSON.parse(popup.sessionStorage.getItem('matrix-line-login-popup')!).id;
    returnedTab.location.search = `?matrix_line_return=${id}`;
    returnedTab.location.hash = '#access_token=callback-token&refresh_token=callback-refresh';
    const finish = finishLineLoginPopup(() => client, returnedTab as unknown as Window);
    await vi.advanceTimersByTimeAsync(2_500);
    await expect(finish).resolves.toBe(false);
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(returnedTab.close).not.toHaveBeenCalled();
    expect(returnedTab.location.hash).toBe('#access_token=callback-token&refresh_token=callback-refresh');
    await vi.advanceTimersByTimeAsync(LINE_LOGIN_ATTEMPT_TTL_MS);
    await rejected;
  });

  it.each(['bad-id', `${crypto.randomUUID()}&matrix_line_return=${crypto.randomUUID()}`])(
    'does not use malformed or duplicate callback IDs: %s', async (id) => {
      const { popup, client, auth } = setup();
      connectBrowserChannels(popup);
      popup.location.search = `?matrix_line_return=${id}`;
      popup.location.hash = '#access_token=callback-token&refresh_token=callback-refresh';
      await expect(finishLineLoginPopup(() => client, popup as unknown as Window)).resolves.toBe(false);
      expect(auth.getSession).not.toHaveBeenCalled();
    },
  );

  it('keeps the PWA open, imports the session and closes only the callback after acknowledgement', async () => {
    const { parent, popup, auth, start, callback } = setup();
    const login = start();
    expect(parent.open).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(0);
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'custom:line', options: {
        redirectTo: `${origin}/?matrix_line_return=${JSON.parse(popup.sessionStorage.getItem('matrix-line-login-popup')!).id}`,
        skipBrowserRedirect: true,
      },
    });
    expect(popup.location.replace).toHaveBeenCalledWith('https://auth.example/authorize');
    expect(parent.location.replace).not.toHaveBeenCalled();
    popup.location.hash = '#access_token=supabase-access&refresh_token=callback-refresh&provider_token=line-revoke-only';
    const finish = callback();
    await expect(login).resolves.toBe('pwa');
    await expect(finish).resolves.toBe(true);
    expect(auth.setSession).toHaveBeenCalledExactlyOnceWith(session);
    expect(popup.close).toHaveBeenCalledOnce();
    expect(parent.close).not.toHaveBeenCalled();
    expect(parent.focus).toHaveBeenCalled();
    expect(readLineProviderToken()).toBe('line-revoke-only');
    expect(popup.sessionStorage.getItem('matrix-line-login-popup')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['origin', 'source', 'id'])('ignores a callback with the wrong %s', async (field) => {
    const { parent, popup, auth, start, send, result } = setup();
    const login = start();
    send(parent, field === 'source' ? browserWindow() : popup,
      field === 'id' ? { ...result(), id: 'old-attempt' } : result(), field === 'origin' ? 'https://attacker.example' : origin);
    await vi.advanceTimersByTimeAsync(0);
    expect(auth.setSession).not.toHaveBeenCalled();
    send(parent, popup, result());
    await expect(login).resolves.toBe('pwa');
  });

  it('accepts a completion once and waits for setSession before acknowledging', async () => {
    const { parent, popup, auth, start, send, result } = setup();
    let complete!: (value: unknown) => void;
    auth.setSession.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const login = start();
    send(parent, popup, result());
    send(parent, popup, result());
    await vi.advanceTimersByTimeAsync(0);
    expect(auth.setSession).toHaveBeenCalledOnce();
    expect(popup.postMessage).not.toHaveBeenCalled();
    complete({ data: { session }, error: null });
    await expect(login).resolves.toBe('pwa');
    expect(popup.postMessage).toHaveBeenCalledOnce();
  });

  it('uses the redirect fallback when the browser cannot control a popup', () => {
    const { parent, start, auth } = setup();
    parent.open.mockReturnValue(null);
    expect(start()).toBeNull();
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('uses the redirect fallback when opening a window throws', () => {
    const { parent, start, auth } = setup();
    parent.open.mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    expect(start()).toBeNull();
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('does not hang if focus or close are refused by the window manager', async () => {
    const { parent, popup, start, callback } = setup();
    parent.focus.mockImplementation(() => { throw new Error('blocked'); });
    popup.close.mockImplementation(() => { throw new Error('blocked'); });
    const login = start();
    popup.location.hash = '#access_token=callback-token&refresh_token=callback-refresh';
    await expect(callback()).resolves.toBe(false);
    await expect(login).resolves.toBe('pwa');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not acknowledge a session Supabase rejects', async () => {
    const { parent, popup, auth, start, send, result } = setup();
    auth.setSession.mockResolvedValue({ data: { session: null }, error: new Error('invalid token') });
    const rejection = expect(start()).rejects.toThrow('LINE_LOGIN_INCOMPLETE');
    send(parent, popup, result());
    await rejection;
    expect(popup.postMessage).not.toHaveBeenCalled();
    expect(readLineProviderToken()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives a received callback its own bounded session import time', async () => {
    const { parent, popup, auth, start, send, result } = setup();
    let complete!: (value: unknown) => void;
    auth.setSession.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const login = start();
    await vi.advanceTimersByTimeAsync(LINE_LOGIN_ATTEMPT_TTL_MS - 1_000);
    send(parent, popup, result());
    await vi.advanceTimersByTimeAsync(2_000);
    expect(popup.close).not.toHaveBeenCalled();
    complete({ data: { session }, error: null });
    await expect(login).resolves.toBe('pwa');
  });

  it('bounds an unresponsive session import and cleans up its listeners', async () => {
    const { parent, popup, auth, start, send, result } = setup();
    auth.setSession.mockReturnValue(new Promise(() => undefined));
    const rejection = expect(start()).rejects.toThrow('LINE_LOGIN_INCOMPLETE');
    send(parent, popup, result());
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up a popup if OAuth cannot be started', async () => {
    const { auth, start, popup } = setup();
    auth.signInWithOAuth.mockRejectedValue(new Error('private-provider-message'));
    await expect(start()).rejects.toThrow('LINE_LOGIN_INCOMPLETE');
    expect(popup.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows retry after the user closes the auth window and returns', async () => {
    const { parent, popup, start } = setup();
    const login = start();
    const rejection = expect(login).rejects.toThrow('LINE_LOGIN_INCOMPLETE');
    popup.closed = true;
    parent.dispatchEvent(new Event('focus'));
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('expires abandoned attempts without trusting a later message', async () => {
    const { parent, popup, start, send, result, auth } = setup();
    const login = start();
    const data = result();
    const rejection = expect(login).rejects.toThrow('LINE_LOGIN_INCOMPLETE');
    await vi.advanceTimersByTimeAsync(LINE_LOGIN_ATTEMPT_TTL_MS);
    await rejection;
    send(parent, popup, data);
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it('does not accept an OAuth error as success even if an older session exists', async () => {
    const { popup, auth, start, callback } = setup();
    const rejection = expect(start()).rejects.toThrow('LINE_LOGIN_INCOMPLETE');
    popup.location.search = '?error=access_denied';
    const finish = callback();
    await rejection;
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(auth.setSession).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    await finish;
  });

  it('does not use an older session when an implicit callback is missing its refresh token', async () => {
    const { popup, auth, start, callback } = setup();
    const rejection = expect(start()).rejects.toThrow('LINE_LOGIN_INCOMPLETE');
    popup.location.hash = '#access_token=incomplete-callback';
    const finish = callback();
    await rejection;
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(popup.history.replaceState).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(finish).resolves.toBe(false);
  });

  it('preserves the Auth client code-exchange path for a PKCE callback', async () => {
    const { popup, auth, start, callback } = setup();
    const login = start();
    popup.location.search = '?code=pkce-callback';
    await expect(callback()).resolves.toBe(true);
    await expect(login).resolves.toBe('pwa');
    expect(auth.getSession).toHaveBeenCalledOnce();
    expect(auth.setSession).toHaveBeenCalledExactlyOnceWith(session);
    expect(popup.history.replaceState).not.toHaveBeenCalled();
  });

  it('does not return a successful session when the callback client rejects the captured tokens', async () => {
    const { popup, auth, client, start, callback } = setup();
    vi.mocked(client.auth.setSession).mockResolvedValue({ data: { session: null, user: null },
      error: new Error('rejected callback') as never });
    const rejection = expect(start()).rejects.toThrow('LINE_LOGIN_INCOMPLETE');
    popup.location.hash = '#access_token=rejected&refresh_token=rejected-refresh&provider_token=unused-line-token';
    const finish = callback();
    await rejection;
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(readLineProviderToken()).toBeNull();
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(finish).resolves.toBe(false);
  });

  it('lets an ordinary browser or a callback with a lost opener load the app', async () => {
    const { popup, callback, start, parent } = setup();
    await expect(callback()).resolves.toBe(false);
    const rejection = expect(start()).rejects.toThrow('LINE_LOGIN_INCOMPLETE');
    popup.location.hash = '#access_token=callback-token&refresh_token=callback-refresh';
    popup.opener = null;
    await expect(callback()).resolves.toBe(false);
    expect(popup.close).not.toHaveBeenCalled();
    popup.closed = true;
    parent.dispatchEvent(new Event('focus'));
    await rejection;
  });

  it('falls back to normal app startup when its parent never acknowledges', async () => {
    const { popup, parent, start, callback } = setup();
    const rejection = expect(start()).rejects.toThrow('LINE_LOGIN_INCOMPLETE');
    parent.postMessage.mockReset();
    popup.location.hash = '#access_token=callback-token&refresh_token=callback-refresh&provider_token=fallback-revoke-token';
    const finish = callback();
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(finish).resolves.toBe(false);
    expect(readLineProviderToken()).toBe('fallback-revoke-token');
    expect(popup.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(LINE_LOGIN_ATTEMPT_TTL_MS);
    await rejection;
  });
});
