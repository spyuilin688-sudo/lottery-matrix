import { useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';

export const MEMBER_SESSION_READ_TIMEOUT_MS = 2_500;

export type MemberSessionSnapshot =
  | { status: 'checking'; session: null; revision: number }
  | { status: 'ready'; session: Session | null; revision: number }
  | { status: 'error'; session: null; revision: number };

let revision = 0;
let snapshot: MemberSessionSnapshot = { status: 'checking', session: null, revision };
const listeners = new Set<() => void>();
let refreshHandler: (() => Promise<Session | null>) | null = null;
let refreshInFlight: Promise<Session | null> | null = null;

function publish(next: Omit<MemberSessionSnapshot, 'revision'>) {
  revision += 1;
  snapshot = { ...next, revision } as MemberSessionSnapshot;
  listeners.forEach((listener) => listener());
}

export function getMemberSessionSnapshot() {
  return snapshot;
}

export function subscribeMemberSession(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMemberSessionSnapshot() {
  return useSyncExternalStore(subscribeMemberSession, getMemberSessionSnapshot, getMemberSessionSnapshot);
}

export function publishMemberSessionChecking() {
  publish({ status: 'checking', session: null });
}

export function publishMemberSessionReady(session: Session | null) {
  publish({ status: 'ready', session });
}

export function publishMemberSessionError() {
  publish({ status: 'error', session: null });
}

export function installMemberSessionRefresh(handler: () => Promise<Session | null>) {
  refreshHandler = handler;
  return () => {
    if (refreshHandler === handler) refreshHandler = null;
    refreshInFlight = null;
  };
}

export function requestMemberSessionRefresh(): Promise<Session | null> {
  if (refreshInFlight) return refreshInFlight;
  if (!refreshHandler) return Promise.reject(new Error('MEMBER_SESSION_REFRESH_UNAVAILABLE'));
  const request = refreshHandler();
  refreshInFlight = request.finally(() => {
    if (refreshInFlight === request || refreshInFlight === wrapped) refreshInFlight = null;
  });
  const wrapped = refreshInFlight;
  return wrapped;
}

export function resetMemberSessionStoreForTests() {
  revision = 0;
  snapshot = { status: 'checking', session: null, revision };
  listeners.clear();
  refreshHandler = null;
  refreshInFlight = null;
}
