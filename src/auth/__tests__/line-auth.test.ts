// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearLineAuthEphemeralState,
  isLineProviderTokenRevokedFor,
  readLineProviderToken,
  rememberLineProviderToken,
} from '../line-provider-token';

const matrixApi = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('../../matrix-api-client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../matrix-api-client')>(),
  matrixApiFetch: matrixApi.fetch,
}));

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
  matrixApi.fetch.mockReset();
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

  it('does not clear Supabase when LINE revoke fails', async () => {
    const { client, signOut } = createClient();
    const revoke = vi.fn().mockRejectedValue(new Error('LINE_PROVIDER_REQUEST_FAILED'));

    await expect(signOutFromMatrix(client as never, revoke)).rejects.toThrow('LINE_PROVIDER_REQUEST_FAILED');

    expect(signOut).not.toHaveBeenCalled();
  });

  it('rejects a getSession error without revoke or Supabase signOut', async () => {
    const sessionError = new Error('SUPABASE_SESSION_READ_FAILED');
    const { client, signOut } = createClient({ sessionError });
    const revoke = vi.fn();

    await expect(signOutFromMatrix(client as never, revoke)).rejects.toBe(sessionError);

    expect(revoke).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('uses the provider token captured from the immediately preceding OAuth event', async () => {
    rememberLineProviderToken('remembered-provider-token');
    const { client } = createClient({ session: { access_token: 'supabase-access-token' } });
    const revoke = vi.fn().mockResolvedValue(undefined);

    await signOutFromMatrix(client as never, revoke);

    expect(revoke).toHaveBeenCalledWith('remembered-provider-token');
  });

  it('still signs out of Supabase when a restored session has no provider token', async () => {
    const { client, signOut } = createClient({ session: { access_token: 'supabase-access-token' } });
    const revoke = vi.fn();

    await signOutFromMatrix(client as never, revoke);

    expect(revoke).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('clears the in-memory provider token after successful revoke and sign-out', async () => {
    rememberLineProviderToken('remembered-provider-token');
    const { client } = createClient({ session: { access_token: 'supabase-access-token' } });

    await signOutFromMatrix(client as never, vi.fn().mockResolvedValue(undefined));

    expect(readLineProviderToken()).toBeNull();
    expect(isLineProviderTokenRevokedFor('supabase-access-token')).toBe(false);
  });

  it('retains the in-memory provider token when revoke fails so logout can be retried', async () => {
    rememberLineProviderToken('remembered-provider-token');
    const { client } = createClient({ session: { access_token: 'supabase-access-token' } });

    await expect(signOutFromMatrix(
      client as never,
      vi.fn().mockRejectedValue(new Error('LINE_PROVIDER_REQUEST_FAILED')),
    )).rejects.toThrow('LINE_PROVIDER_REQUEST_FAILED');

    expect(readLineProviderToken()).toBe('remembered-provider-token');
  });

  it('retries revoke for the same session after revoke failure without setting a marker', async () => {
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
    const revoke = vi.fn()
      .mockImplementationOnce(async () => {
        order.push('revoke:failed');
        throw new Error('LINE_PROVIDER_REQUEST_FAILED');
      })
      .mockImplementationOnce(async () => {
        order.push('revoke:succeeded');
      });

    await expect(signOutFromMatrix(client as never, revoke)).rejects.toThrow('LINE_PROVIDER_REQUEST_FAILED');

    expect(revoke).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
    expect(readLineProviderToken()).toBe('remembered-provider-token');
    expect(isLineProviderTokenRevokedFor('same-access-token')).toBe(false);

    await signOutFromMatrix(client as never, revoke);

    expect(order).toEqual(['revoke:failed', 'revoke:succeeded', 'signOut']);
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenNthCalledWith(1, 'remembered-provider-token');
    expect(revoke).toHaveBeenNthCalledWith(2, 'remembered-provider-token');
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(readLineProviderToken()).toBeNull();
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

  it('posts the exact provider token JSON to the authenticated logout API', async () => {
    matrixApi.fetch.mockResolvedValue(undefined);

    await revokeLineProviderToken('provider-token');

    expect(matrixApi.fetch).toHaveBeenCalledWith('/api/auth/line/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerAccessToken: 'provider-token' }),
    });
  });
});
