// @vitest-environment jsdom
import type { Session, SupportedStorage } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as supabaseModule from './supabase';
import {
  createProviderTokenSafeStorage,
  createSupabaseAuthStorage,
} from './supabase-auth-storage';

class AsyncMemoryStorage implements SupportedStorage {
  readonly values = new Map<string, string>();

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  async removeItem(key: string) {
    this.values.delete(key);
  }
}

function lineSession(): Session {
  return {
    access_token: 'supabase-access-token',
    refresh_token: 'supabase-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    provider_token: 'line-provider-token',
    provider_refresh_token: 'line-provider-refresh-token',
    user: {
      id: 'member-id',
      aud: 'authenticated',
      app_metadata: { provider: 'custom:line' },
      user_metadata: { provider_token: 'profile-field-must-remain' },
      created_at: '2026-08-24T00:00:00.000Z',
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('production Supabase configuration', () => {
  it('keeps the configured project available when build-time overrides are absent', () => {
    expect(supabaseModule.hasSupabaseConfig()).toBe(true);
    const client = supabaseModule.getSupabaseClient() as unknown as { supabaseKey: string; supabaseUrl: string };
    expect(client.supabaseUrl).toBe('https://wcimzbbapfrdotjsfyxa.supabase.co');
    expect(client.supabaseKey).toBe('sb_publishable_sJuiSZhS6bCOza_RGTMVPg_JFiVv0F8');
  });
});

describe('provider-token-safe Supabase auth storage', () => {
  it('strips root provider credentials on write without losing the Supabase session', async () => {
    const backing = new AsyncMemoryStorage();
    const storage = createProviderTokenSafeStorage(backing);
    const session = lineSession();

    await storage.setItem('auth-session', JSON.stringify(session));

    const persisted = JSON.parse(backing.values.get('auth-session') ?? 'null');
    expect(persisted).toMatchObject({
      access_token: 'supabase-access-token',
      refresh_token: 'supabase-refresh-token',
      user: {
        id: 'member-id',
        user_metadata: { provider_token: 'profile-field-must-remain' },
      },
    });
    expect(persisted).not.toHaveProperty('provider_token');
    expect(persisted).not.toHaveProperty('provider_refresh_token');
    expect(session.provider_token).toBe('line-provider-token');
    expect(session.provider_refresh_token).toBe('line-provider-refresh-token');
  });

  it('scrubs a legacy stored session on read and immediately rewrites the backing value', async () => {
    const backing = new AsyncMemoryStorage();
    backing.values.set('auth-session', JSON.stringify(lineSession()));
    const storage = createProviderTokenSafeStorage(backing);

    const returned = await storage.getItem('auth-session');
    const returnedSession = JSON.parse(returned ?? 'null');
    const rewrittenSession = JSON.parse(backing.values.get('auth-session') ?? 'null');

    for (const persisted of [returnedSession, rewrittenSession]) {
      expect(persisted).toMatchObject({
        access_token: 'supabase-access-token',
        refresh_token: 'supabase-refresh-token',
        user: { id: 'member-id' },
      });
      expect(persisted).not.toHaveProperty('provider_token');
      expect(persisted).not.toHaveProperty('provider_refresh_token');
    }
  });

  it('fails closed with a fixed error when a legacy session can be neither rewritten nor removed', async () => {
    const key = 'unsafe-legacy-session';
    const legacyValue = JSON.stringify(lineSession());
    window.localStorage.setItem(key, legacyValue);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('write failed with line-provider-token');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('remove failed with line-provider-refresh-token');
    });
    const storage = createSupabaseAuthStorage();

    const failure = await Promise.resolve(storage.getItem(key)).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('SUPABASE_AUTH_STORAGE_UNSAFE');
    expect(failure).not.toHaveProperty('cause');
    expect(String(failure)).not.toContain('line-provider-token');
    expect(String(failure)).not.toContain('line-provider-refresh-token');
    expect(window.localStorage.getItem(key)).toBe(legacyValue);
  });

  it('uses sanitized memory fallback only after removing a legacy unsafe value', async () => {
    const key = 'removable-legacy-session';
    window.localStorage.setItem(key, JSON.stringify(lineSession()));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('persistent storage is read-only');
    });
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    const storage = createSupabaseAuthStorage();

    const returned = JSON.parse(await storage.getItem(key) ?? 'null');

    expect(removeItem).toHaveBeenCalledWith(key);
    expect(window.localStorage.getItem(key)).toBeNull();
    expect(returned).toMatchObject({
      access_token: 'supabase-access-token',
      refresh_token: 'supabase-refresh-token',
      user: { id: 'member-id' },
    });
    expect(returned).not.toHaveProperty('provider_token');
    expect(returned).not.toHaveProperty('provider_refresh_token');
  });

  it('fails closed when an attached persisted session cannot be removed', async () => {
    const key = 'unremovable-session';
    const persistedValue = JSON.stringify(lineSession());
    window.localStorage.setItem(key, persistedValue);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('remove failed with line-provider-token and line-provider-refresh-token');
    });
    const storage = createSupabaseAuthStorage();

    const failure = await Promise.resolve(storage.removeItem(key)).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('SUPABASE_AUTH_STORAGE_UNSAFE');
    expect(failure).not.toHaveProperty('cause');
    expect(String(failure)).not.toContain('line-provider-token');
    expect(String(failure)).not.toContain('line-provider-refresh-token');
    expect(window.localStorage.getItem(key)).toBe(persistedValue);
  });

  it.each([
    ['PKCE verifier index', JSON.stringify(['flow-id'])],
    ['PKCE verifier', JSON.stringify('plain-pkce-verifier')],
    ['unrelated JSON', JSON.stringify({ code_verifier: 'verifier', provider: 'custom:line' })],
    ['malformed legacy value', 'not-json'],
  ])('passes through %s values exactly', async (_label, value) => {
    const backing = new AsyncMemoryStorage();
    const storage = createProviderTokenSafeStorage(backing);

    await storage.setItem('auth-value', value);
    expect(backing.values.get('auth-value')).toBe(value);
    expect(await storage.getItem('auth-value')).toBe(value);
    expect(backing.values.get('auth-value')).toBe(value);
  });

  it('sanitizes the installed Auth client save path while retaining the in-memory provider token', async () => {
    const client = supabaseModule.getSupabaseClient();
    const auth = client.auth as unknown as {
      _saveSession(session: Session): Promise<void>;
      storageKey: string;
    };
    const session = lineSession();

    await auth._saveSession(session);

    const persisted = JSON.parse(window.localStorage.getItem(auth.storageKey) ?? 'null');
    expect(persisted).toMatchObject({
      access_token: 'supabase-access-token',
      refresh_token: 'supabase-refresh-token',
      user: { id: 'member-id' },
    });
    expect(persisted).not.toHaveProperty('provider_token');
    expect(persisted).not.toHaveProperty('provider_refresh_token');
    expect(session.provider_token).toBe('line-provider-token');
    expect(session.provider_refresh_token).toBe('line-provider-refresh-token');
  });

  it('propagates a fixed failure from the installed Auth client when persisted sign-out cannot remove its session', async () => {
    const client = supabaseModule.getSupabaseClient();
    const auth = client.auth as unknown as {
      _removeSession(): Promise<void>;
      storageKey: string;
    };
    const persistedValue = JSON.stringify(lineSession());
    window.localStorage.setItem(auth.storageKey, persistedValue);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('auth-js removal leaked line-provider-token and line-provider-refresh-token');
    });

    const failure = await auth._removeSession().then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('SUPABASE_AUTH_STORAGE_UNSAFE');
    expect(failure).not.toHaveProperty('cause');
    expect(String(failure)).not.toContain('line-provider-token');
    expect(String(failure)).not.toContain('line-provider-refresh-token');
    expect(window.localStorage.getItem(auth.storageKey)).toBe(persistedValue);
  });
});
