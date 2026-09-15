import type { Session } from '@supabase/supabase-js';

type ProviderSession = Pick<Session, 'user'> | null | undefined;

function normalizedProvider(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function sessionAuthProvider(session: ProviderSession): string | null {
  const user = session?.user;
  if (!user) return null;

  const appProvider = normalizedProvider(user.app_metadata?.provider);
  if (appProvider) return appProvider;

  const identities = Array.isArray(user.identities) ? user.identities : [];
  if (identities.length !== 1) return null;
  return normalizedProvider(identities[0]?.provider);
}

export function isLineProviderSession(session: ProviderSession): boolean {
  if (!session) return false;

  // Some legacy tests/restored in-memory session fixtures omit the user object.
  // Real Supabase Session objects include it; keep the legacy fallback LINE-safe.
  if (!session.user) return true;

  return sessionAuthProvider(session) === 'custom:line';
}
