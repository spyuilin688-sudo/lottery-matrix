// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearLineAuthEphemeralState,
  isLineProviderTokenRevokedFor,
  readLineProviderToken,
  rememberLineProviderToken,
} from '../line-provider-token';

import { revokeLineProviderToken, signInWithLine, signOutFromMatrix } from '../line-auth';

function createClient({
  session = { access_token: 'supabase-access-token', provider_token: 'provider-token' },
  sessionError = null,
  signOut = vi.fn().mockResolvedValue({ error: null }),
}: {
  session?: { access_token: string; provider_token?: string } | null;
  sessionError?: Error | null;
  signOut?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    client: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session }, error: sessionError }),
        signOut,
      },
    },
    signOut,
  };
}

afterEach(() => {
  clearLineAuthEphemeralState();
  vi.restoreAllMocks();
});

describe('LINE auth helper', () => {
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
