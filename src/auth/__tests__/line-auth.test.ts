// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearLineAuthEphemeralState,
  isLineProviderTokenRevokedFor,
  readLineProviderToken,
  rememberLineProviderToken,
} from '../line-provider-token';

import * as lineAuthModule from '../line-auth';
import { revokeLineProviderToken, signInWithLine, signOutFromMatrix } from '../line-auth';
import type { SupabaseClient } from '@supabase/supabase-js';
import { startMemberOnlineTracking } from '../../member-online';

type LogicalSession = { access_token: string };

function accessTokenForSession(sessionId: string, version: string) {
  const encode = (value: unknown) => btoa(JSON.stringify(value))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ session_id: sessionId, version })}.signature`;
}

function reconcileUncertainPresence(session: LogicalSession | null | undefined) {
  const reconcile = (lineAuthModule as unknown as {
    reconcilePendingLineLogoutPresence?: (value: LogicalSession | null | undefined) => void;
  }).reconcilePendingLineLogoutPresence;
  if (!reconcile) throw new Error('RECONCILIATION_API_MISSING');
  reconcile(session);
}

function createClient({
  session = { access_token: 'supabase-access-token', provider_token: 'provider-token' },
  sessionError = null,
  signOut = vi.fn().mockResolvedValue({ error: null }),
  getSession,
}: {
  session?: { access_token: string; provider_token?: string } | null;
  sessionError?: Error | null;
  signOut?: ReturnType<typeof vi.fn>;
  getSession?: ReturnType<typeof vi.fn>;
} = {}) {
  const readSession = getSession ?? vi.fn().mockResolvedValue({ data: { session }, error: sessionError });
  return {
    client: {
      auth: {
        getSession: readSession,
        signOut,
      },
    },
    getSession: readSession,
    signOut,
  };
}

afterEach(() => {
  (lineAuthModule as unknown as {
    reconcilePendingLineLogoutPresence?: (value: null) => void;
  }).reconcilePendingLineLogoutPresence?.(null);
  vi.useRealTimers();
  clearLineAuthEphemeralState();
  vi.restoreAllMocks();
});

describe('LINE auth helper', () => {
  it('opens an installed fullscreen PWA login window before OAuth starts', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query === '(display-mode: fullscreen)' })));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
    try {
      const login = signInWithLine(undefined, { auth: { signInWithOAuth } } as unknown as SupabaseClient);
      expect(open).toHaveBeenCalledOnce();
      await login;
      // Engines without controllable windows retain their existing redirect flow.
      expect(signInWithOAuth).toHaveBeenCalledWith({
        provider: 'custom:line', options: { redirectTo: new URL('/', window.location.origin).href },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses the exact approved origin root', async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: null });

    await signInWithLine(
      `${window.location.origin}/`,
      { auth: { signInWithOAuth } } as never,
    );

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'custom:line',
      options: { redirectTo: `${window.location.origin}/` },
    });
  });

  it('rejects an unapproved same-origin path', async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: null });

    await expect(signInWithLine(
      `${window.location.origin}/profile`,
      { auth: { signInWithOAuth } } as never,
    )).rejects.toThrow('LINE_RETURN_URL_NOT_ALLOWED');

    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it('rejects a cross-origin return URL before starting OAuth', async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: null });

    await expect(signInWithLine(
      'https://attacker.example/callback',
      { auth: { signInWithOAuth } } as never,
    )).rejects.toThrow('LINE_RETURN_URL_NOT_ALLOWED');

    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it.each([
    ['query', `${window.location.origin}/?returnTo=%2Fprofile`],
    ['fragment', `${window.location.origin}/#profile`],
  ])('rejects an origin-root return URL containing a %s', async (_label, returnUrl) => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: null });

    await expect(signInWithLine(
      returnUrl,
      { auth: { signInWithOAuth } } as never,
    )).rejects.toThrow('LINE_RETURN_URL_NOT_ALLOWED');

    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it('rejects an origin-root return URL containing URL credentials', async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: null });
    const credentialed = new URL('/', window.location.origin);
    credentialed.username = 'matrix-user';
    credentialed.password = 'matrix-password';

    await expect(signInWithLine(
      credentialed.href,
      { auth: { signInWithOAuth } } as never,
    )).rejects.toThrow('LINE_RETURN_URL_NOT_ALLOWED');

    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it('rejects an origin-root return URL on a mismatched port', async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: null });
    const mismatchedPort = new URL('/', window.location.origin);
    mismatchedPort.port = mismatchedPort.port === '4173' ? '4174' : '4173';

    await expect(signInWithLine(
      mismatchedPort.href,
      { auth: { signInWithOAuth } } as never,
    )).rejects.toThrow('LINE_RETURN_URL_NOT_ALLOWED');

    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it('throws when Supabase cannot start LINE OAuth', async () => {
    const failure = new Error('LINE_OAUTH_FAILED');
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: failure });

    await expect(signInWithLine(
      `${window.location.origin}/`,
      { auth: { signInWithOAuth } } as never,
    )).rejects.toBe(failure);
  });

  it('revokes the LINE token before Supabase signOut', async () => {
    const order: string[] = [];
    const signOut = vi.fn().mockImplementation(async () => {
      order.push('signOut');
      return { error: null };
    });
    const { client } = createClient({ signOut });
    const revoke = vi.fn().mockImplementation(async () => {
      order.push('revoke');
    });

    await signOutFromMatrix(client as never, revoke);

    expect(order).toEqual(['revoke', 'signOut']);
    expect(revoke).toHaveBeenCalledWith('provider-token');
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('prefers the current session provider token over stale process memory', async () => {
    rememberLineProviderToken('stale-remembered-provider-token');
    const { client } = createClient({
      session: {
        access_token: 'supabase-access-token',
        provider_token: 'current-session-provider-token',
      },
    });
    const revoke = vi.fn().mockResolvedValue(undefined);

    await signOutFromMatrix(client as never, revoke);

    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('current-session-provider-token');
    expect(revoke).not.toHaveBeenCalledWith('stale-remembered-provider-token');
  });

  it('continues local sign-out when LINE revoke fails', async () => {
    const { client, signOut } = createClient();
    const revoke = vi.fn().mockRejectedValue(new Error('LINE_PROVIDER_REQUEST_FAILED'));
    const cleanupPush = vi.fn();

    await signOutFromMatrix(client as never, revoke, cleanupPush);

    expect(cleanupPush).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('continues local sign-out when the current session cannot be read', async () => {
    const sessionError = new Error('SUPABASE_SESSION_READ_FAILED');
    const { client, signOut } = createClient({ sessionError });
    const revoke = vi.fn();
    const cleanupPush = vi.fn();

    await signOutFromMatrix(client as never, revoke, cleanupPush);

    expect(revoke).not.toHaveBeenCalled();
    expect(cleanupPush).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('uses the provider token captured from the immediately preceding OAuth event', async () => {
    rememberLineProviderToken('remembered-provider-token');
    const { client } = createClient({ session: { access_token: 'supabase-access-token' } });
    const revoke = vi.fn().mockResolvedValue(undefined);

    await signOutFromMatrix(client as never, revoke);

    expect(revoke).toHaveBeenCalledWith('remembered-provider-token');
  });

  it('signs out a restored session when no LINE provider token is available', async () => {
    const { client, signOut } = createClient({ session: { access_token: 'supabase-access-token' } });
    const revoke = vi.fn();
    const cleanupPush = vi.fn();

    await signOutFromMatrix(client as never, revoke, cleanupPush);

    expect(revoke).not.toHaveBeenCalled();
    expect(cleanupPush).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('cleans up the current browser push subscription before local sign-out', async () => {
    const order: string[] = [];
    const signOut = vi.fn().mockImplementation(async () => {
      order.push('signOut');
      return { error: null };
    });
    const { client } = createClient({ signOut });
    const cleanupPush = vi.fn().mockImplementation(async () => {
      order.push('cleanupPush');
    });

    await signOutFromMatrix(client as never, vi.fn(), cleanupPush);

    expect(order).toEqual(['cleanupPush', 'signOut']);
  });

  it('does not block local sign-out when push cleanup fails', async () => {
    const { client, signOut } = createClient();

    await signOutFromMatrix(
      client as never,
      vi.fn(),
      vi.fn().mockRejectedValue(new Error('PUSH_CLEANUP_FAILED')),
    );

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('ends the active backend online session before local sign-out', async () => {
    const order: string[] = [];
    const signOut = vi.fn().mockImplementation(async () => {
      order.push('signOut');
      return { error: null };
    });
    const { client } = createClient({ session: null, signOut });
    const cleanupPush = vi.fn().mockImplementation(async () => {
      order.push('cleanupPush');
    });
    const cleanupOnline = vi.fn().mockImplementation(async () => {
      order.push('cleanupOnline');
    });

    await signOutFromMatrix(client as never, vi.fn(), cleanupPush, cleanupOnline);

    expect(order).toEqual(['cleanupOnline', 'cleanupPush', 'signOut']);
  });

  it('waits for an already in-flight presence end before local sign-out', async () => {
    let resolveEnd: ((value: Record<string, unknown>) => void) | undefined;
    const pendingEnd = new Promise<Record<string, unknown>>((resolve) => {
      resolveEnd = resolve;
    });
    const post = vi.fn((path: string) => path.endsWith('/start')
      ? Promise.resolve({ sessionId: 'session-backgrounding' })
      : pendingEnd);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const stopTracking = startMemberOnlineTracking(post, document);
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith('/api/member-online/start', {}));

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith(
      '/api/member-online/end',
      { sessionId: 'session-backgrounding' },
    ));

    const signOut = vi.fn().mockResolvedValue({ error: null });
    const { client } = createClient({ session: null, signOut });
    const logout = signOutFromMatrix(client as never, vi.fn(), vi.fn());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(signOut).not.toHaveBeenCalled();
    resolveEnd?.({ onlineSeconds: 5 });
    await logout;
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });

    stopTracking();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('resumes online tracking when local sign-out fails', async () => {
    const resumeOnline = vi.fn();
    const cleanupOnline = vi.fn().mockResolvedValue(resumeOnline);
    const { client } = createClient({
      session: null,
      signOut: vi.fn().mockResolvedValue({ error: new Error('private returned detail') }),
    });

    await expect(signOutFromMatrix(
      client as never,
      vi.fn(),
      vi.fn(),
      cleanupOnline,
    )).rejects.toThrow('SUPABASE_SIGN_OUT_FAILED');

    expect(cleanupOnline).toHaveBeenCalledTimes(1);
    expect(resumeOnline).toHaveBeenCalledTimes(1);
  });

  it('leaves online tracking stopped after successful local sign-out', async () => {
    const resumeOnline = vi.fn();
    const cleanupOnline = vi.fn().mockResolvedValue(resumeOnline);
    const { client } = createClient({ session: null });

    await signOutFromMatrix(client as never, vi.fn(), vi.fn(), cleanupOnline);

    expect(cleanupOnline).toHaveBeenCalledTimes(1);
    expect(resumeOnline).not.toHaveBeenCalled();
  });

  it('clears the in-memory provider token after successful revoke and sign-out', async () => {
    rememberLineProviderToken('remembered-provider-token');
    const { client } = createClient({ session: { access_token: 'supabase-access-token' } });

    await signOutFromMatrix(client as never, vi.fn().mockResolvedValue(undefined));

    expect(readLineProviderToken()).toBeNull();
    expect(isLineProviderTokenRevokedFor('supabase-access-token')).toBe(false);
  });

  it('clears the in-memory provider token after local sign-out even when revoke fails', async () => {
    rememberLineProviderToken('remembered-provider-token');
    const { client, signOut } = createClient({ session: { access_token: 'supabase-access-token' } });

    await signOutFromMatrix(
      client as never,
      vi.fn().mockRejectedValue(new Error('LINE_PROVIDER_REQUEST_FAILED')),
    );

    expect(readLineProviderToken()).toBeNull();
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('attempts revoke first but still completes local logout when revoke fails', async () => {
    const order: string[] = [];
    rememberLineProviderToken('remembered-provider-token');
    const signOut = vi.fn().mockImplementation(async () => {
      order.push('signOut');
      return { error: null };
    });
    const { client } = createClient({
      session: { access_token: 'same-access-token' },
      signOut,
    });
    const revoke = vi.fn().mockImplementation(async () => {
      order.push('revoke:failed');
      throw new Error('LINE_PROVIDER_REQUEST_FAILED');
    });

    await signOutFromMatrix(client as never, revoke);

    expect(order).toEqual(['revoke:failed', 'signOut']);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(readLineProviderToken()).toBeNull();
    expect(isLineProviderTokenRevokedFor('same-access-token')).toBe(false);
  });

  it('keeps the provider token for retry when both revoke and local sign-out fail', async () => {
    rememberLineProviderToken('remembered-provider-token');
    const { client } = createClient({
      session: { access_token: 'same-access-token' },
      signOut: vi.fn().mockResolvedValue({ error: new Error('private returned detail') }),
    });

    await expect(signOutFromMatrix(
      client as never,
      vi.fn().mockRejectedValue(new Error('LINE_PROVIDER_REQUEST_FAILED')),
    )).rejects.toThrow('SUPABASE_SIGN_OUT_FAILED');

    expect(readLineProviderToken()).toBe('remembered-provider-token');
    expect(isLineProviderTokenRevokedFor('same-access-token')).toBe(false);
  });

  it('retries only Supabase signOut for the same access token after revoke succeeds', async () => {
    rememberLineProviderToken('remembered-provider-token');
    const signOut = vi.fn()
      .mockResolvedValueOnce({ error: new Error('private returned detail') })
      .mockResolvedValueOnce({ error: null });
    const { client } = createClient({
      session: { access_token: 'same-access-token' },
      signOut,
    });
    const revoke = vi.fn().mockResolvedValue(undefined);

    await expect(signOutFromMatrix(client as never, revoke)).rejects.toThrow('SUPABASE_SIGN_OUT_FAILED');
    expect(readLineProviderToken()).toBeNull();
    expect(isLineProviderTokenRevokedFor('same-access-token')).toBe(true);

    rememberLineProviderToken('new-provider-token-after-revoke');
    expect(readLineProviderToken()).toBe('new-provider-token-after-revoke');

    await signOutFromMatrix(client as never, revoke);

    expect(revoke).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(2);
    expect(readLineProviderToken()).toBeNull();
    expect(isLineProviderTokenRevokedFor('same-access-token')).toBe(false);
  });

  it('sanitizes a thrown Supabase signOut failure and preserves the same-token retry marker', async () => {
    const privateFailure = new Error('private thrown detail');
    const signOut = vi.fn()
      .mockRejectedValueOnce(privateFailure)
      .mockResolvedValueOnce({ error: null });
    const { client } = createClient({ signOut });
    const revoke = vi.fn().mockResolvedValue(undefined);

    await expect(signOutFromMatrix(client as never, revoke)).rejects.toMatchObject({
      message: 'SUPABASE_SIGN_OUT_FAILED',
    });
    await signOutFromMatrix(client as never, revoke);

    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it('never applies a revoked marker to a different Supabase access token', async () => {
    const firstSignOut = vi.fn().mockResolvedValue({ error: new Error('failed') });
    const first = createClient({
      session: { access_token: 'first-access-token', provider_token: 'first-provider-token' },
      signOut: firstSignOut,
    });
    const revoke = vi.fn().mockResolvedValue(undefined);
    await expect(signOutFromMatrix(first.client as never, revoke)).rejects.toThrow('SUPABASE_SIGN_OUT_FAILED');

    const second = createClient({
      session: { access_token: 'second-access-token', provider_token: 'second-provider-token' },
    });
    await signOutFromMatrix(second.client as never, revoke);

    expect(revoke).toHaveBeenNthCalledWith(2, 'second-provider-token');
  });

  it('bounds the initial session read at exactly 2.5 seconds before local sign-out', async () => {
    vi.useFakeTimers();
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const { client } = createClient({
      getSession: vi.fn().mockReturnValue(new Promise(() => undefined)),
      signOut,
    });
    const logout = signOutFromMatrix(
      client as never,
      vi.fn(),
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
    );

    await vi.advanceTimersByTimeAsync(2_499);
    expect(signOut).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await logout;

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('bounds a never-settling LINE revoke at exactly 5 seconds', async () => {
    vi.useFakeTimers();
    const { client, signOut } = createClient();
    const logout = signOutFromMatrix(
      client as never,
      vi.fn().mockReturnValue(new Promise(() => undefined)),
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
    );

    await vi.advanceTimersByTimeAsync(4_999);
    expect(signOut).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await logout;

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it.each([
    ['online cleanup', 'online'],
    ['push cleanup', 'push'],
  ])('bounds never-settling %s at exactly 2.5 seconds', async (_label, pendingStep) => {
    vi.useFakeTimers();
    const { client, signOut } = createClient({ session: null });
    const neverSettles = vi.fn().mockReturnValue(new Promise(() => undefined));
    const resolves = vi.fn().mockResolvedValue(undefined);
    const logout = signOutFromMatrix(
      client as never,
      vi.fn(),
      pendingStep === 'push' ? neverSettles : resolves,
      pendingStep === 'online' ? neverSettles : resolves,
    );

    await vi.advanceTimersByTimeAsync(2_499);
    expect(signOut).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await logout;

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('runs revoke, online cleanup, and push cleanup in parallel', async () => {
    vi.useFakeTimers();
    const { client, signOut } = createClient();
    const neverSettles = vi.fn().mockReturnValue(new Promise(() => undefined));
    const logout = signOutFromMatrix(client as never, neverSettles, neverSettles, neverSettles);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(signOut).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await logout;

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('reconciles a local sign-out timeout after exactly 8 seconds and succeeds when the session is gone', async () => {
    vi.useFakeTimers();
    rememberLineProviderToken('remembered-provider-token');
    const getSession = vi.fn()
      .mockResolvedValueOnce({ data: { session: { access_token: 'same-access-token' } }, error: null })
      .mockResolvedValueOnce({ data: { session: null }, error: null });
    const { client, signOut } = createClient({
      getSession,
      signOut: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const logout = signOutFromMatrix(
      client as never,
      vi.fn().mockRejectedValue(new Error('LINE_PROVIDER_REQUEST_FAILED')),
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
    );

    await vi.advanceTimersByTimeAsync(7_999);
    expect(getSession).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await logout;

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(readLineProviderToken()).toBeNull();
  });

  it('reports a failed timed-out sign-out and resumes presence when reconciliation still has a session', async () => {
    vi.useFakeTimers();
    const resumeOnline = vi.fn();
    const getSession = vi.fn()
      .mockResolvedValueOnce({
        data: { session: { access_token: 'same-access-token', provider_token: 'provider-token' } },
        error: null,
      })
      .mockResolvedValueOnce({ data: { session: { access_token: 'same-access-token' } }, error: null });
    const { client } = createClient({
      getSession,
      signOut: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const logout = signOutFromMatrix(
      client as never,
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(resumeOnline),
    );

    const rejection = expect(logout).rejects.toThrow('SUPABASE_SIGN_OUT_FAILED');
    await vi.advanceTimersByTimeAsync(8_000);
    await rejection;

    expect(resumeOnline).toHaveBeenCalledTimes(1);
    expect(isLineProviderTokenRevokedFor('same-access-token')).toBe(true);
  });

  it('reports an uncertain sign-out without resuming presence when reconciliation cannot finish in 2.5 seconds', async () => {
    vi.useFakeTimers();
    const resumeOnline = vi.fn();
    const getSession = vi.fn()
      .mockResolvedValueOnce({
        data: { session: { access_token: 'same-access-token', provider_token: 'provider-token' } },
        error: null,
      })
      .mockReturnValueOnce(new Promise(() => undefined));
    const { client } = createClient({
      getSession,
      signOut: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const logout = signOutFromMatrix(
      client as never,
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(resumeOnline),
    );

    const rejection = expect(logout).rejects.toThrow('SUPABASE_SIGN_OUT_UNCERTAIN');
    await vi.advanceTimersByTimeAsync(8_000);
    await vi.advanceTimersByTimeAsync(2_499);
    expect(resumeOnline).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await rejection;

    expect(resumeOnline).not.toHaveBeenCalled();
    expect(isLineProviderTokenRevokedFor('same-access-token')).toBe(true);
  });

  it('reports an uncertain sign-out without resuming presence when reconciliation returns an error', async () => {
    vi.useFakeTimers();
    const resumeOnline = vi.fn();
    const getSession = vi.fn()
      .mockResolvedValueOnce({ data: { session: { access_token: 'same-access-token' } }, error: null })
      .mockResolvedValueOnce({ data: { session: null }, error: new Error('private read detail') });
    const { client } = createClient({
      getSession,
      signOut: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const logout = signOutFromMatrix(
      client as never,
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(resumeOnline),
    );

    const rejection = expect(logout).rejects.toThrow('SUPABASE_SIGN_OUT_UNCERTAIN');
    await vi.advanceTimersByTimeAsync(8_000);
    await rejection;

    expect(resumeOnline).not.toHaveBeenCalled();
  });

  it('resumes presence once when timed-out online cleanup returns its handle after a definite sign-out failure', async () => {
    vi.useFakeTimers();
    let resolveOnlineCleanup!: (resume: () => void) => void;
    const resumeOnline = vi.fn();
    const cleanupOnline = vi.fn().mockReturnValue(new Promise<void | (() => void)>((resolve) => {
      resolveOnlineCleanup = resolve;
    }));
    const { client } = createClient({
      session: null,
      signOut: vi.fn().mockResolvedValue({ error: new Error('private returned detail') }),
    });
    const logout = signOutFromMatrix(
      client as never,
      vi.fn(),
      vi.fn().mockResolvedValue(undefined),
      cleanupOnline,
    );

    const rejection = expect(logout).rejects.toThrow('SUPABASE_SIGN_OUT_FAILED');
    await vi.advanceTimersByTimeAsync(2_500);
    await rejection;
    expect(resumeOnline).not.toHaveBeenCalled();

    resolveOnlineCleanup(resumeOnline);
    await Promise.resolve();
    await Promise.resolve();

    expect(resumeOnline).toHaveBeenCalledTimes(1);
  });

  it('does not use a late online resume handle after successful sign-out', async () => {
    vi.useFakeTimers();
    let resolveOnlineCleanup!: (resume: () => void) => void;
    const resumeOnline = vi.fn();
    const cleanupOnline = vi.fn().mockReturnValue(new Promise<void | (() => void)>((resolve) => {
      resolveOnlineCleanup = resolve;
    }));
    const { client } = createClient({ session: null });
    const logout = signOutFromMatrix(
      client as never,
      vi.fn(),
      vi.fn().mockResolvedValue(undefined),
      cleanupOnline,
    );

    await vi.advanceTimersByTimeAsync(2_500);
    await logout;
    resolveOnlineCleanup(resumeOnline);
    await Promise.resolve();
    await Promise.resolve();

    expect(resumeOnline).not.toHaveBeenCalled();
  });

  it('does not use a late online resume handle after uncertain sign-out', async () => {
    vi.useFakeTimers();
    let resolveOnlineCleanup!: (resume: () => void) => void;
    const resumeOnline = vi.fn();
    const cleanupOnline = vi.fn().mockReturnValue(new Promise<void | (() => void)>((resolve) => {
      resolveOnlineCleanup = resolve;
    }));
    const getSession = vi.fn()
      .mockResolvedValueOnce({ data: { session: null }, error: null })
      .mockReturnValueOnce(new Promise(() => undefined));
    const { client } = createClient({
      getSession,
      signOut: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const logout = signOutFromMatrix(
      client as never,
      vi.fn(),
      vi.fn().mockResolvedValue(undefined),
      cleanupOnline,
    );

    const rejection = expect(logout).rejects.toThrow('SUPABASE_SIGN_OUT_UNCERTAIN');
    await vi.advanceTimersByTimeAsync(13_000);
    await rejection;
    resolveOnlineCleanup(resumeOnline);
    await Promise.resolve();
    await Promise.resolve();

    expect(resumeOnline).not.toHaveBeenCalled();
  });

  it('resumes uncertain logout presence exactly once after retry confirms the same logical session', async () => {
    vi.useFakeTimers();
    const firstToken = accessTokenForSession('same-session', 'first');
    const refreshedToken = accessTokenForSession('same-session', 'refreshed');
    const resumeOnline = vi.fn();
    const getSession = vi.fn()
      .mockResolvedValueOnce({
        data: { session: { access_token: firstToken, provider_token: 'provider-token' } },
        error: null,
      })
      .mockResolvedValueOnce({ data: { session: null }, error: new Error('private retry detail') });
    const { client } = createClient({
      getSession,
      signOut: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const logout = signOutFromMatrix(
      client as never,
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(resumeOnline),
    );

    const rejection = expect(logout).rejects.toThrow('SUPABASE_SIGN_OUT_UNCERTAIN');
    await vi.advanceTimersByTimeAsync(8_000);
    await rejection;
    expect(resumeOnline).not.toHaveBeenCalled();

    reconcileUncertainPresence({ access_token: refreshedToken });
    reconcileUncertainPresence({ access_token: refreshedToken });

    expect(resumeOnline).toHaveBeenCalledTimes(1);
  });

  it('keeps uncertain presence paused for an unknown retry and resumes after a late handle arrives', async () => {
    vi.useFakeTimers();
    const firstToken = accessTokenForSession('late-session', 'first');
    const refreshedToken = accessTokenForSession('late-session', 'refreshed');
    let resolveOnlineCleanup!: (resume: () => void) => void;
    const resumeOnline = vi.fn();
    const cleanupOnline = vi.fn().mockReturnValue(new Promise<void | (() => void)>((resolve) => {
      resolveOnlineCleanup = resolve;
    }));
    const getSession = vi.fn()
      .mockResolvedValueOnce({ data: { session: { access_token: firstToken } }, error: null })
      .mockResolvedValueOnce({ data: { session: null }, error: new Error('private retry detail') });
    const { client } = createClient({
      getSession,
      signOut: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const logout = signOutFromMatrix(
      client as never,
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
      cleanupOnline,
    );

    const rejection = expect(logout).rejects.toThrow('SUPABASE_SIGN_OUT_UNCERTAIN');
    await vi.advanceTimersByTimeAsync(10_500);
    await rejection;

    reconcileUncertainPresence(undefined);
    resolveOnlineCleanup(resumeOnline);
    await Promise.resolve();
    await Promise.resolve();
    expect(resumeOnline).not.toHaveBeenCalled();

    reconcileUncertainPresence({ access_token: refreshedToken });
    expect(resumeOnline).toHaveBeenCalledTimes(1);
  });

  it('clears uncertain presence without using a late resume handle when retry confirms no session', async () => {
    vi.useFakeTimers();
    const firstToken = accessTokenForSession('cleared-session', 'first');
    let resolveOnlineCleanup!: (resume: () => void) => void;
    const resumeOnline = vi.fn();
    const cleanupOnline = vi.fn().mockReturnValue(new Promise<void | (() => void)>((resolve) => {
      resolveOnlineCleanup = resolve;
    }));
    const getSession = vi.fn()
      .mockResolvedValueOnce({ data: { session: { access_token: firstToken } }, error: null })
      .mockResolvedValueOnce({ data: { session: null }, error: new Error('private retry detail') });
    const { client } = createClient({
      getSession,
      signOut: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const logout = signOutFromMatrix(
      client as never,
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
      cleanupOnline,
    );

    const rejection = expect(logout).rejects.toThrow('SUPABASE_SIGN_OUT_UNCERTAIN');
    await vi.advanceTimersByTimeAsync(10_500);
    await rejection;

    reconcileUncertainPresence(null);
    resolveOnlineCleanup(resumeOnline);
    await Promise.resolve();
    await Promise.resolve();

    expect(resumeOnline).not.toHaveBeenCalled();
  });

  it('never resumes an uncertain tracker for a different logical session', async () => {
    vi.useFakeTimers();
    const resumeOnline = vi.fn();
    const getSession = vi.fn()
      .mockResolvedValueOnce({
        data: { session: { access_token: accessTokenForSession('old-session', 'first') } },
        error: null,
      })
      .mockResolvedValueOnce({ data: { session: null }, error: new Error('private retry detail') });
    const { client } = createClient({
      getSession,
      signOut: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const logout = signOutFromMatrix(
      client as never,
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(resumeOnline),
    );

    const rejection = expect(logout).rejects.toThrow('SUPABASE_SIGN_OUT_UNCERTAIN');
    await vi.advanceTimersByTimeAsync(8_000);
    await rejection;

    reconcileUncertainPresence({
      access_token: accessTokenForSession('new-session', 'first'),
    });
    reconcileUncertainPresence({
      access_token: accessTokenForSession('old-session', 'refreshed'),
    });

    expect(resumeOnline).not.toHaveBeenCalled();
  });

  it('does not mistake a reconciliation error message for proof that the session remains', async () => {
    vi.useFakeTimers();
    const resumeOnline = vi.fn();
    const getSession = vi.fn()
      .mockResolvedValueOnce({ data: { session: { access_token: 'same-access-token' } }, error: null })
      .mockResolvedValueOnce({ data: { session: null }, error: new Error('SUPABASE_SIGN_OUT_FAILED') });
    const { client } = createClient({
      getSession,
      signOut: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const logout = signOutFromMatrix(
      client as never,
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(resumeOnline),
    );

    const rejection = expect(logout).rejects.toThrow('SUPABASE_SIGN_OUT_UNCERTAIN');
    await vi.advanceTimersByTimeAsync(8_000);
    await rejection;

    expect(resumeOnline).not.toHaveBeenCalled();
  });

  it('invokes the authenticated Supabase logout function with the exact provider token', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });

    await revokeLineProviderToken(
      'provider-token',
      { functions: { invoke } } as never,
    );

    expect(invoke).toHaveBeenCalledWith('line-logout', {
      body: { providerAccessToken: 'provider-token' },
    });
  });
});
