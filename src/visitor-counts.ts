import { getSupabaseClient } from './lib/supabase';

let pending: Promise<void> | null = null;

export function recordVisitor(): Promise<void> {
  pending ??= (async () => {
    try {
      await getSupabaseClient().functions.invoke('visitor-visit', { body: {} });
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
