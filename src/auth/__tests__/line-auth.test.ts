import { describe, expect, it, vi } from 'vitest';
import { signInWithLine, signOutFromMatrix } from '../line-auth';

describe('LINE auth helper', () => {
  it('starts custom:line OAuth with the provided return URL', async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: null });

    await signInWithLine(
      'https://matrixlottery.idv.tw',
      { auth: { signInWithOAuth } } as never,
    );

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'custom:line',
      options: { redirectTo: 'https://matrixlottery.idv.tw' },
    });
  });

  it('throws when Supabase cannot start LINE OAuth', async () => {
    const failure = new Error('LINE_OAUTH_FAILED');
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: failure });

    await expect(signInWithLine(
      'https://matrixlottery.idv.tw',
      { auth: { signInWithOAuth } } as never,
    )).rejects.toBe(failure);
  });

  it('signs out the Supabase session', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });

    await signOutFromMatrix({ auth: { signOut } } as never);

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
