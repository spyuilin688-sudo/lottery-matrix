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
  it('uses the existing PWA popup flow when Android PWA has Service Worker support', async () => {
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
      auth: { signInWithOAuth: vi.fn() },
    } as unknown as SupabaseClient;
    popupMock.mockReturnValue(Promise.resolve('pwa'));

    await expect(signInWithLine(undefined, loginClient)).resolves.toBe('pwa');
    expect(popupMock).toHaveBeenCalledOnce();
    expect(loginClient.auth.signInWithOAuth).not.toHaveBeenCalled();
  });
});
