// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearLineAuthEphemeralState,
  clearLineProviderToken,
  isLineProviderTokenRevokedFor,
  markLineProviderTokenRevokedFor,
  readLineProviderToken,
  rememberLineProviderToken,
} from '../line-provider-token';

afterEach(() => {
  clearLineAuthEphemeralState();
  vi.restoreAllMocks();
});

describe('line provider token memory', () => {
  it('retains only a non-empty provider token in process memory', () => {
    rememberLineProviderToken('line-provider-token');
    expect(readLineProviderToken()).toBe('line-provider-token');

    rememberLineProviderToken('');
    expect(readLineProviderToken()).toBe('line-provider-token');
  });

  it('clears the remembered provider token', () => {
    rememberLineProviderToken('line-provider-token');
    clearLineProviderToken();

    expect(readLineProviderToken()).toBeNull();
  });

  it('does not read or serialize provider tokens through web storage', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');

    rememberLineProviderToken('line-provider-token');
    readLineProviderToken();
    clearLineProviderToken();

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('matches a completed LINE revoke only to the exact Supabase access token', () => {
    markLineProviderTokenRevokedFor('first-access-token');

    expect(isLineProviderTokenRevokedFor('first-access-token')).toBe(true);
    expect(isLineProviderTokenRevokedFor('second-access-token')).toBe(false);
    expect(isLineProviderTokenRevokedFor(null)).toBe(false);
  });

  it('clears both the provider token and exact-token revoke marker', () => {
    rememberLineProviderToken('line-provider-token');
    markLineProviderTokenRevokedFor('access-token');

    clearLineAuthEphemeralState();

    expect(readLineProviderToken()).toBeNull();
    expect(isLineProviderTokenRevokedFor('access-token')).toBe(false);
  });

  it('does not persist the exact-token revoke marker in web storage', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');

    markLineProviderTokenRevokedFor('access-token');
    isLineProviderTokenRevokedFor('access-token');
    clearLineAuthEphemeralState();

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });
});
