import { getSupabaseClient } from './lib/supabase';

let pending: Promise<void> | null = null;
const FOREGROUND_TRANSITION_MS = 1_500;

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
  let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
  let leftForeground = false;
  const onVisible = () => {
    if (document.visibilityState === 'hidden') {
      if (hiddenTimer === undefined && !leftForeground) {
        hiddenTimer = setTimeout(() => { hiddenTimer = undefined; leftForeground = true; }, FOREGROUND_TRANSITION_MS);
      }
      return;
    }
    if (hiddenTimer !== undefined) { clearTimeout(hiddenTimer); hiddenTimer = undefined; }
    if (!leftForeground) return;
    leftForeground = false;
    void recordVisitor();
  };
  const onPageHide = () => {
    if (hiddenTimer !== undefined) { clearTimeout(hiddenTimer); hiddenTimer = undefined; }
    leftForeground = true;
  };
  const onPageShow = () => { if (document.visibilityState === 'visible') onVisible(); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    if (hiddenTimer !== undefined) clearTimeout(hiddenTimer);
  };
}
