import { useEffect } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';
import { bootstrapMember } from '../member-api';
import { clearLineAuthEphemeralState, rememberLineProviderToken } from './line-provider-token';
import { cleanupBrowserPushSubscription } from '../push-subscription';
import { startMemberOnlineTracking } from '../member-online';
import { postMemberOnline } from '../member-online-api';
import { withDeadline } from '../lib/api-resilience';
import { logicalSessionIdentity } from './session-identity';
import { isLineProviderSession } from './session-provider';
import { updateAlgorithmCacheSession } from './algorithm-cache-scope';
import {
  getMemberSessionSnapshot,
  MEMBER_SESSION_READ_TIMEOUT_MS,
  installMemberSessionRefresh,
  publishMemberSessionChecking,
  publishMemberSessionError,
  publishMemberSessionReady,
} from './member-session-store';

type Props = {
  client?: SupabaseClient;
  bootstrap?: () => Promise<unknown>;
  cleanupPush?: () => Promise<void>;
  startTracking?: typeof startMemberOnlineTracking;
};

export function MemberSessionBridge({
  client = getSupabaseClient(),
  bootstrap = bootstrapMember,
  cleanupPush = cleanupBrowserPushSubscription,
  startTracking = startMemberOnlineTracking,
}: Props) {
  useEffect(() => {
    let active = true;
    let authRevision = 0;
    let currentSessionIdentity: string | null = null;
    let sessionGeneration = 0;
    let bootstrappedGeneration: number | null = null;
    let stopTracking: (() => void) | null = null;
    const processingGenerations = new Set<number>();
    const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

    const stopMemberOnlineTracking = () => {
      const stop = stopTracking;
      stopTracking = null;
      stop?.();
    };

    const bootstrapSession = async (identity: string, generation: number) => {
      if (
        !active
        || currentSessionIdentity !== identity
        || sessionGeneration !== generation
        || bootstrappedGeneration === generation
        || processingGenerations.has(generation)
      ) {
        return;
      }

      processingGenerations.add(generation);
      try {
        await bootstrap();
      } catch {
        // A later auth event may retry a failed member bootstrap.
        return;
      } finally {
        processingGenerations.delete(generation);
      }

      if (!active || currentSessionIdentity !== identity || sessionGeneration !== generation) {
        return;
      }

      bootstrappedGeneration = generation;
      if (!stopTracking) {
        stopTracking = startTracking(postMemberOnline);
      }
    };

    const queueBootstrap = (identity: string, generation: number) => {
      const timer = setTimeout(() => {
        pendingTimers.delete(timer);
        void bootstrapSession(identity, generation);
      }, 0);
      pendingTimers.add(timer);
    };

    const updateSession = (session: Session | null, deferBootstrap: boolean) => {
      updateAlgorithmCacheSession(session);
      const identity = logicalSessionIdentity(session);
      if (currentSessionIdentity !== identity) {
        currentSessionIdentity = identity;
        sessionGeneration += 1;
        bootstrappedGeneration = null;
        stopMemberOnlineTracking();
      }

      if (!identity) {
        stopMemberOnlineTracking();
        return;
      }

      if (deferBootstrap) queueBootstrap(identity, sessionGeneration);
      else void bootstrapSession(identity, sessionGeneration);
    };

    publishMemberSessionChecking();

    const readCurrentSession = async () => {
      const startedRevision = authRevision;
      try {
        const { data, error } = await withDeadline(() => client.auth.getSession(), { timeoutMs: MEMBER_SESSION_READ_TIMEOUT_MS });
        if (error) throw error;
        if (!active) return data.session;
        if (authRevision !== startedRevision) {
          const current = getMemberSessionSnapshot();
          return current.status === 'ready' ? current.session : null;
        }
        publishMemberSessionReady(data.session);
        updateSession(data.session, false);
        return data.session;
      } catch (error) {
        if (active && authRevision === startedRevision) publishMemberSessionError();
        throw error;
      }
    };

    const uninstallRefresh = installMemberSessionRefresh(readCurrentSession);
    void readCurrentSession().catch(() => undefined);

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      authRevision += 1;
      const currentSession = event === 'SIGNED_OUT' ? null : session;
      publishMemberSessionReady(currentSession);
      if (event === 'SIGNED_OUT') {
        clearLineAuthEphemeralState();
        void cleanupPush().catch(() => undefined);
        updateSession(null, false);
        return;
      } else if (session?.provider_token && isLineProviderSession(session)) {
        rememberLineProviderToken(session.provider_token);
      }

      updateSession(session, true);
    });

    return () => {
      active = false;
      sessionGeneration += 1;
      currentSessionIdentity = null;
      pendingTimers.forEach((timer) => clearTimeout(timer));
      pendingTimers.clear();
      stopMemberOnlineTracking();
      uninstallRefresh();
      subscription.unsubscribe();
    };
  }, [bootstrap, cleanupPush, client, startTracking]);

  return null;
}
