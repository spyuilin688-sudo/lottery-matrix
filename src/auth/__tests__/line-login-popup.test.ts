// @vitest-environment jsdom
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finishLineLoginPopup, signInWithLinePopup } from '../line-login-popup';
import { LINE_LOGIN_ATTEMPT_TTL_MS } from '../line-login-attempt';
import { clearLineAuthEphemeralState, readLineProviderToken } from '../line-provider-token';

const origin = 'https://matrixlottery.idv.tw';
const session = { access_token: 'supabase-access', refresh_token: 'supabase-refresh' };
function browserWindow() {
  const storage = new Map<string, string>();
  return Object.assign(new EventTarget(), {
    location: { origin, hash: '', search: '', replace: vi.fn() },
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
  const send = (target: typeof parent, source: typeof parent, data: unknown, from = origin) => {
    target.dispatchEvent(new MessageEvent('message', { data, origin: from, source: source as unknown as Window }));
  };
  popup.postMessage.mockImplementation((data) => send(popup, parent, data));
  parent.postMessage.mockImplementation((data) => send(parent, popup, data));
  const start = () => signInWithLinePopup(`${origin}/`, client, parent as unknown as Window)!;
  const callback = () => finishLineLoginPopup(() => client, popup as unknown as Window);
  const result = () => ({ type: 'matrix-line-login-result',
    id: JSON.parse(popup.sessionStorage.getItem('matrix-line-login-popup')!).id, ...session });
  return { parent, popup, auth, client, send, start, callback, result };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); clearLineAuthEphemeralState(); });

describe('installed PWA LINE login return', () => {
  it('keeps the PWA open, imports the session and closes only the callback after acknowledgement', async () => {
    const { parent, popup, auth, start, callback } = setup();
    const login = start();
    expect(parent.open).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(0);
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'custom:line', options: { redirectTo: `${origin}/`, skipBrowserRedirect: true },
    });
    expect(popup.location.replace).toHaveBeenCalledWith('https://auth.example/authorize');
    expect(parent.location.replace).not.toHaveBeenCalled();
    popup.location.hash = '#access_token=supabase-access&provider_token=line-revoke-only';
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
    popup.location.hash = '#access_token=callback-token';
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

  it('lets an ordinary browser or a callback with a lost opener load the app', async () => {
    const { popup, callback, start, parent } = setup();
    await expect(callback()).resolves.toBe(false);
    const rejection = expect(start()).rejects.toThrow('LINE_LOGIN_INCOMPLETE');
    popup.location.hash = '#access_token=callback-token';
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
    popup.location.hash = '#access_token=callback-token&provider_token=fallback-revoke-token';
    const finish = callback();
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(finish).resolves.toBe(false);
    expect(readLineProviderToken()).toBe('fallback-revoke-token');
    expect(popup.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(LINE_LOGIN_ATTEMPT_TTL_MS);
    await rejection;
  });
});
