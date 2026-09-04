import type { Session } from '@supabase/supabase-js';

type SessionWithAccessToken = Pick<Session, 'access_token'>;

function decodeJwtPayload(accessToken: string): unknown {
  const payload = accessToken.split('.')[1];
  if (!payload) return null;
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function logicalSessionIdentity(session: SessionWithAccessToken | null): string | null {
  const accessToken = session?.access_token;
  if (typeof accessToken !== 'string' || !accessToken) return null;

  try {
    const payload = decodeJwtPayload(accessToken);
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const sessionId = (payload as { session_id?: unknown }).session_id;
      if (typeof sessionId === 'string' && sessionId.trim()) {
        // This unverified claim is only a lifecycle correlation key, never an authorization decision.
        return `session:${sessionId.trim()}`;
      }
    }
  } catch {
    // Legacy tests and restored sessions may use opaque tokens; exact-token fallback stays fail-safe.
  }

  return `access-token:${accessToken}`;
}
