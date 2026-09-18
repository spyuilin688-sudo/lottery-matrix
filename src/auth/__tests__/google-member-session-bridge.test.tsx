// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemberSessionBridge } from '../MemberSessionBridge';
import { clearLineAuthEphemeralState, readLineProviderToken } from '../line-provider-token';

afterEach(() => {
  cleanup();
  clearLineAuthEphemeralState();
  vi.restoreAllMocks();
});

describe('Google member session bridge', () => {
  it('bootstraps the member without storing the Google provider token as a LINE token', async () => {
    let callback: ((event: string, session: unknown) => void) | undefined;
    const bootstrap = vi.fn().mockResolvedValue(undefined);
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: vi.fn((next: (event: string, session: unknown) => void) => {
          callback = next;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
      },
    };

    render(
      <MemberSessionBridge
        client={client as never}
        bootstrap={bootstrap}
        cleanupPush={vi.fn().mockResolvedValue(undefined)}
        startTracking={vi.fn(() => vi.fn()) as never}
      />,
    );

    callback?.('SIGNED_IN', {
      access_token: 'google-supabase-access-token',
      provider_token: 'google-provider-token',
      user: {
        app_metadata: { provider: 'google', providers: ['google'] },
        identities: [{ provider: 'google' }],
      },
    });

    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(1));
    expect(readLineProviderToken()).toBeNull();
  });
});
