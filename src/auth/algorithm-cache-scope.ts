import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { MatrixApiError } from '../matrix-api-client';
import { clearReadCache } from '../read-cache';
import { logicalSessionIdentity } from './session-identity';

let identity: string | null | undefined;
let generation = 0;
const listeners = new Set<() => void>();
const initializationListeners = new Set<() => void>();

export function getAlgorithmCacheScope() {
  return generation;
}

export function subscribeAlgorithmCacheScope(listener: () => void, options: { notifyOnInitialize?: boolean } = {}) {
  listeners.add(listener);
  if (options.notifyOnInitialize) initializationListeners.add(listener);
  return () => { listeners.delete(listener); initializationListeners.delete(listener); };
}

function sessionIdentity(session: Session | null) {
  const logicalIdentity = logicalSessionIdentity(session);
  return session?.user?.id && logicalIdentity
    ? `${session.user.id}:${logicalIdentity}`
    : null;
}

// Called synchronously by the auth bridge, without making SDK calls inside its callback.
export function updateAlgorithmCacheSession(session: Session | null) {
  const next = sessionIdentity(session);
  if (identity !== next) {
    const wasInitialized = identity !== undefined;
    identity = next;
    generation += 1;
    clearReadCache('matrix-rpc:');
    (wasInitialized ? listeners : initializationListeners).forEach((listener) => listener());
  }
}

export async function readAlgorithmCacheScope(
  client: SupabaseClient,
  options: { allowGuest?: boolean } = {},
): Promise<number> {
  const startedGeneration = generation;
  const startedIdentity = identity;
  const { data, error } = await client.auth.getSession();
  // An auth event supersedes a session lookup that was already in flight.
  const returnedIdentity = sessionIdentity(data.session);
  if (generation !== startedGeneration
    && (returnedIdentity !== identity || returnedIdentity === startedIdentity)) {
    throw new MatrixApiError('AUTH_REQUIRED', 401);
  }
  if (error) throw new MatrixApiError('AUTH_REQUIRED', 401);
  updateAlgorithmCacheSession(data.session);
  if (!identity && !options.allowGuest) throw new MatrixApiError('AUTH_REQUIRED', 401);
  return generation;
}
