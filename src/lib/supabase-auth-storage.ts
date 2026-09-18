import type { SupportedStorage } from '@supabase/supabase-js';

const providerCredentialKeys = ['provider_token', 'provider_refresh_token'] as const;

function sanitizeSerializedSession(value: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return value;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return value;
  }

  const session = parsed as Record<string, unknown>;
  if (!providerCredentialKeys.some((key) => Object.hasOwn(session, key))) {
    return value;
  }

  const sanitizedSession = { ...session };
  for (const key of providerCredentialKeys) delete sanitizedSession[key];
  return JSON.stringify(sanitizedSession);
}

export function createProviderTokenSafeStorage(storage: SupportedStorage): SupportedStorage {
  return {
    isServer: storage.isServer,
    async getItem(key) {
      const storedValue = await storage.getItem(key);
      if (storedValue === null) return null;

      const sanitizedValue = sanitizeSerializedSession(storedValue);
      if (sanitizedValue !== storedValue) {
        await storage.setItem(key, sanitizedValue);
      }
      return sanitizedValue;
    },
    async setItem(key, value) {
      await storage.setItem(key, sanitizeSerializedSession(value));
    },
    async removeItem(key) {
      await storage.removeItem(key);
    },
  };
}

function createMemoryStorage(): SupportedStorage {
  const values = new Map<string, string>();

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function browserLocalStorage(): SupportedStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function createResilientStorage(primary: SupportedStorage | null): SupportedStorage {
  const fallback = createMemoryStorage();
  let persistent = primary;

  return {
    async getItem(key) {
      if (persistent) {
        try {
          return await persistent.getItem(key);
        } catch {
          persistent = null;
        }
      }
      return fallback.getItem(key);
    },
    async setItem(key, value) {
      if (persistent) {
        try {
          await persistent.setItem(key, value);
          return;
        } catch {
          try {
            await persistent.removeItem(key);
          } catch {
            throw new Error('SUPABASE_AUTH_STORAGE_UNSAFE');
          }
          persistent = null;
        }
      }
      await fallback.setItem(key, value);
    },
    async removeItem(key) {
      if (persistent) {
        try {
          await persistent.removeItem(key);
          return;
        } catch {
          throw new Error('SUPABASE_AUTH_STORAGE_UNSAFE');
        }
      }
      await fallback.removeItem(key);
    },
  };
}

export function createSupabaseAuthStorage() {
  return createProviderTokenSafeStorage(createResilientStorage(browserLocalStorage()));
}
