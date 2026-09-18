import { useSyncExternalStore } from 'react';
import { getSupabaseClient } from './lib/supabase';
import { invalidateMatrixData } from './matrix-data-revision';

export type PermissionSettings = {
  subscriptionPurchaseVisible: boolean;
  registeredMemberFreeAccess: boolean;
  revision: number;
  updatedAt: string;
};
let settings: PermissionSettings | null = null;
let highestRevision = -1;
let requestSequence = 0;
let lastSettledRequest = 0;
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
  try {
    const { data, error } = await getSupabaseClient().rpc('matrix_permission_settings');
    if (error || !data || typeof data.subscriptionPurchaseVisible !== 'boolean'
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
  }
}

export function installPermissionSettingsRefresh() {
  const refresh = () => { if (!document.hidden) void refreshPermissionSettings().catch(() => {}); };
  refresh();
  const timer = window.setInterval(refresh, 30_000);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('focus', refresh);
    document.removeEventListener('visibilitychange', refresh);
  };
}
