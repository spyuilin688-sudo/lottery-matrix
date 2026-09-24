import { useSyncExternalStore } from 'react';
import { getSupabaseClient } from './lib/supabase';
import { invalidateMatrixData } from './matrix-data-revision';

export type PermissionSettings = {
  ecpayReviewLoginVisible?: boolean;
  subscriptionPurchaseVisible: boolean;
  registeredMemberFreeAccess: boolean;
  revision: number;
  updatedAt: string;
};
let settings: PermissionSettings | null = null;
let highestRevision = -1;
let requestSequence = 0;
let lastSettledRequest = 0;
const foregroundRefreshMinIntervalMs = 30_000;
const fallbackRefreshIntervalMs = 12 * 60 * 60_000;
let lastRefreshStartedAt = -Infinity;
let activeRequests = 0;
let sharedRead: Promise<PermissionSettings> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => settings;
const serverSnapshot = () => null;

export function usePermissionSettings() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export async function refreshPermissionSettings(): Promise<PermissionSettings> {
  const sequence = ++requestSequence;
  lastRefreshStartedAt = Date.now();
  activeRequests++;
  try {
    const { data, error } = await getSupabaseClient().rpc('matrix_permission_settings');
    if (error || !data || (data.ecpayReviewLoginVisible !== undefined && typeof data.ecpayReviewLoginVisible !== 'boolean')
      || typeof data.subscriptionPurchaseVisible !== 'boolean'
      || typeof data.registeredMemberFreeAccess !== 'boolean'
      || !Number.isSafeInteger(data.revision) || data.revision < 0
      || typeof data.updatedAt !== 'string' || !Number.isFinite(Date.parse(data.updatedAt))) {
      throw new Error('PERMISSION_SETTINGS_UNAVAILABLE');
    }
    if (sequence >= lastSettledRequest && data.revision >= highestRevision
      && (!settings || data.revision > settings.revision)) {
      const previous = settings;
      settings = data as PermissionSettings;
      highestRevision = data.revision;
      lastSettledRequest = sequence;
      if (previous) invalidateMatrixData();
      notify();
    }
    if (!settings) throw new Error('PERMISSION_SETTINGS_UNAVAILABLE');
    lastSettledRequest = Math.max(lastSettledRequest, sequence);
    return settings;
  } catch (error) {
    // Hide purchase entries and discard protected cached results on an unknown state.
    if (sequence >= lastSettledRequest) {
      lastSettledRequest = sequence;
      if (settings) { settings = null; invalidateMatrixData(); notify(); }
    }
    throw error;
  } finally {
    activeRequests--;
  }
}

/**
 * Page reads reuse the published revision. Scheduled foreground / idle refreshes
 * remain force-refreshes; server RPCs still authorize each result cache hit.
 */
function refreshSharedRead(): Promise<PermissionSettings> {
  if (sharedRead) return sharedRead;
  sharedRead = refreshPermissionSettings().finally(() => {
    sharedRead = null;
  });
  return sharedRead;
}

export function readPermissionSettings(): Promise<PermissionSettings> {
  if (sharedRead) return sharedRead;
  if (settings) return Promise.resolve(settings);
  return refreshSharedRead();
}

export function installPermissionSettingsRefresh() {
  let timer: number;
  let disposed = false;

  const scheduleFallback = () => {
    if (disposed) return;
    window.clearTimeout(timer);
    const elapsed = Date.now() - lastRefreshStartedAt;
    const remaining = fallbackRefreshIntervalMs - elapsed;
    const delay = Number.isFinite(remaining) && remaining > 0
      ? remaining
      : document.hidden
        ? fallbackRefreshIntervalMs
        : activeRequests > 0
          ? 1_000
          : 0;
    timer = window.setTimeout(runFallback, delay);
  };

  const startBackgroundRead = () => {
    if (disposed) return;
    void refreshSharedRead()
      .catch(() => {})
      .finally(() => { if (!disposed) scheduleFallback(); });
  };

  const runFallback = () => {
    if (disposed) return;
    if (
      !document.hidden
      && activeRequests === 0
      && Date.now() - lastRefreshStartedAt >= fallbackRefreshIntervalMs
    ) {
      startBackgroundRead();
      return;
    }
    scheduleFallback();
  };

  const refreshOnForegroundEvent = () => {
    if (disposed) return;
    if (
      !document.hidden
      && activeRequests === 0
      && Date.now() - lastRefreshStartedAt >= foregroundRefreshMinIntervalMs
    ) {
      startBackgroundRead();
      return;
    }
    scheduleFallback();
  };

  runFallback();
  window.addEventListener('focus', refreshOnForegroundEvent);
  window.addEventListener('online', refreshOnForegroundEvent);
  document.addEventListener('visibilitychange', refreshOnForegroundEvent);
  return () => {
    disposed = true;
    window.clearTimeout(timer);
    window.removeEventListener('focus', refreshOnForegroundEvent);
    window.removeEventListener('online', refreshOnForegroundEvent);
    document.removeEventListener('visibilitychange', refreshOnForegroundEvent);
  };
}
