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
  it('keeps native LINE defaults in the original navigation even when Android PWA supports Service Workers', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',
      platform: 'Linux',
      maxTouchPoints: 5,
      serviceWorker: {},
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

    await expect(signInWithLine(undefined, loginClient)).resolves.toBeUndefined();
    expect(popupMock).not.toHaveBeenCalled();
    expect(loginClient.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'custom:line',
      options: { redirectTo: new URL('/', window.location.origin).href },
    });
  });
});
