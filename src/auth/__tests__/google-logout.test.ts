// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { signOutFromMatrix } from '../line-auth';

describe('Google session logout', () => {
  it('signs out locally without sending the Google provider token to LINE revoke', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: 'supabase-google-access-token',
              provider_token: 'google-provider-token',
              user: {
                app_metadata: { provider: 'google', providers: ['google'] },
                identities: [{ provider: 'google' }],
              },
            },
          },
          error: null,
        }),
        signOut,
      },
    };
    const revokeLine = vi.fn().mockResolvedValue(undefined);

    await signOutFromMatrix(
      client as never,
      revokeLine,
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
    );

    expect(revokeLine).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
  });
});
