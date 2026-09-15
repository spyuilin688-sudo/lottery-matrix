// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { signInWithGoogle } from '../google-auth';

describe('Google auth helper', () => {
  it('starts Google OAuth with only the account picker and approved app-root return', async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
    const redirectTo = new URL('/', window.location.origin).href;

    await signInWithGoogle(
      redirectTo,
      { auth: { signInWithOAuth } } as never,
    );

    expect(signInWithOAuth).toHaveBeenCalledExactlyOnceWith({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { prompt: 'select_account' },
      },
    });
  });

  it('surfaces a Supabase Google OAuth startup failure', async () => {
    const failure = new Error('GOOGLE_OAUTH_FAILED');
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: failure });

    await expect(signInWithGoogle(
      new URL('/', window.location.origin).href,
      { auth: { signInWithOAuth } } as never,
    )).rejects.toBe(failure);
  });
});
