import { getSupabaseClient } from './lib/supabase';

const storageKey = 'matrix.visitor.v1';
const retentionMs = 90 * 86_400_000;
type Identity = { hash: string; createdAt: number };
let pending: Promise<void> | null = null;

async function currentIdentity(): Promise<Identity> {
  const now = Date.now();
  const raw = localStorage.getItem(storageKey);
  let saved: Partial<Identity> | null = null;
  try { saved = raw ? JSON.parse(raw) : null; } catch { /* Replace invalid local data. */ }
  if (saved && typeof saved.hash === 'string' && /^[a-f0-9]{64}$/.test(saved.hash)
      && typeof saved.createdAt === 'number' && saved.createdAt <= now
      && now - saved.createdAt < retentionMs) return saved as Identity;
  const bytes = new TextEncoder().encode(crypto.randomUUID());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  // Another tab may have stored its identity while digest was pending.
  const latest = localStorage.getItem(storageKey);
  if (latest !== raw) return currentIdentity();
  const identity = { hash, createdAt: now };
  localStorage.setItem(storageKey, JSON.stringify(identity));
  return identity;
}

export function recordVisitor(): Promise<void> {
  pending ??= (async () => {
    try {
      const identity = navigator.locks
        ? await navigator.locks.request(storageKey, currentIdentity)
        : await currentIdentity();
      await getSupabaseClient().rpc('record_matrix_visit', { p_visitor_hash: identity.hash });
    } catch { /* Visit counting must not interrupt the PWA. */ }
  })().finally(() => { pending = null; });
  return pending;
}

export function installVisitorTracking() {
  if (import.meta.env.DEV) return () => undefined;
  void recordVisitor();
  const onVisible = () => {
    if (document.visibilityState === 'visible') void recordVisitor();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => document.removeEventListener('visibilitychange', onVisible);
}
