// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signInWithLine } from '../line-auth';
import { signInWithLinePopup } from '../line-login-popup';

vi.mock('../line-login-popup', () => ({
  signInWithLinePopup: vi.fn(),
}));

const popupMock = vi.mocked(signInWithLinePopup);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  popupMock.mockReset();
});

describe('mobile PWA LINE login', () => {
  it.each([
    {
      name: 'Android',
      navigator: {
        userAgent: 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',
        platform: 'Linux',
        maxTouchPoints: 5,
        serviceWorker: {},
      },
    },
    {
      name: 'iOS',
      navigator: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
        platform: 'iPhone',
        maxTouchPoints: 5,
        standalone: true,
      },
    },
  ])('keeps the $name PWA open by using the controlled LINE login window', async ({ navigator }) => {
    vi.stubGlobal('navigator', {
      ...navigator,
    });
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(display-mode: standalone)',
    })));

    const loginClient = {
      auth: { signInWithOAuth: vi.fn().mockResolvedValue({
        data: { provider: 'custom:line', url: 'https://access.line.me/oauth2/v2.1/authorize' }, error: null,
      }) },
    } as unknown as SupabaseClient;
    popupMock.mockReturnValue(Promise.resolve('pwa'));

    await expect(signInWithLine(undefined, loginClient)).resolves.toBe('pwa');
    expect(popupMock).toHaveBeenCalledExactlyOnceWith(
      new URL('/', window.location.origin).href,
      loginClient,
    );
    expect(loginClient.auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('falls back to same-window OAuth when the controlled window is blocked', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 16) Chrome/140.0 Mobile Safari/537.36',
      platform: 'Linux',
      maxTouchPoints: 5,
    });
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(display-mode: standalone)',
    })));
    const loginClient = {
      auth: { signInWithOAuth: vi.fn().mockResolvedValue({ error: null }) },
    } as unknown as SupabaseClient;
    popupMock.mockReturnValue(null);

    await expect(signInWithLine(undefined, loginClient)).resolves.toBeUndefined();
    expect(popupMock).toHaveBeenCalledOnce();
    expect(loginClient.auth.signInWithOAuth).toHaveBeenCalledExactlyOnceWith({
      provider: 'custom:line',
      options: { redirectTo: new URL('/', window.location.origin).href },
    });
  });
});
