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
const refreshIntervalMs = 30_000;
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
 * Protected and automatic callers share only the current in-flight read.
 * Explicit refreshPermissionSettings() remains a force-refresh primitive so
 * revision ordering can still be verified with overlapping explicit refreshes.
 */
export function readPermissionSettings(): Promise<PermissionSettings> {
  if (sharedRead) return sharedRead;
  sharedRead = refreshPermissionSettings().finally(() => {
    sharedRead = null;
  });
  return sharedRead;
}

export function installPermissionSettingsRefresh() {
  let timer: number;
  const refresh = () => {
    window.clearTimeout(timer);
    // Explicit permission checks also satisfy the automatic refresh window.
    // Keep their fresh reads and fail-closed behavior; coalesce only background events.
    if (!document.hidden && activeRequests === 0 && Date.now() - lastRefreshStartedAt >= refreshIntervalMs) {
      void readPermissionSettings().catch(() => {});
    }
    const remaining = refreshIntervalMs - (Date.now() - lastRefreshStartedAt);
    timer = window.setTimeout(refresh, remaining > 0 ? remaining : refreshIntervalMs);
  };
  refresh();
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  return () => {
    window.clearTimeout(timer);
    window.removeEventListener('focus', refresh);
    document.removeEventListener('visibilitychange', refresh);
  };
}
