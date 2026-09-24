import { useEffect } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';
import { bootstrapMember } from '../member-api';
import { clearLineAuthEphemeralState, rememberLineProviderToken } from './line-provider-token';
import { cleanupBrowserPushSubscription, restoreBrowserPushSubscription } from '../push-subscription';
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
  restorePush?: typeof restoreBrowserPushSubscription;
  startTracking?: typeof startMemberOnlineTracking;
};

export function MemberSessionBridge({
  client = getSupabaseClient(),
  bootstrap = bootstrapMember,
  cleanupPush = cleanupBrowserPushSubscription,
  restorePush = restoreBrowserPushSubscription,
  startTracking = startMemberOnlineTracking,
}: Props) {
  useEffect(() => {
    let active = true;
    let authRevision = 0;
    let initialReadSettled = false;
    let initialReadFailed = false;
    let currentSessionIdentity: string | null = null;
    let sessionGeneration = 0;
    let bootstrappedGeneration: number | null = null;
    let restoredPushGeneration: number | null = null;
    let stopTracking: (() => void) | null = null;
    const processingGenerations = new Set<number>();
    const restoringPushGenerations = new Set<number>();
    const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

    const stopMemberOnlineTracking = () => {
      const stop = stopTracking;
      stopTracking = null;
      stop?.();
    };

    const restoreSessionPush = async (identity: string, generation: number) => {
      const isCurrent = () => active && currentSessionIdentity === identity && sessionGeneration === generation;
      if (!isCurrent() || restoredPushGeneration === generation || restoringPushGenerations.has(generation)) return;
      restoringPushGenerations.add(generation);
      try {
        await restorePush(isCurrent);
        if (isCurrent()) restoredPushGeneration = generation;
      } catch {
        // Retry on a later auth/online event; never block login or prompt for permission.
      } finally {
        restoringPushGenerations.delete(generation);
      }
    };

    const bootstrapSession = async (identity: string, generation: number) => {
      if (
        !active
        || currentSessionIdentity !== identity
        || sessionGeneration !== generation
        || processingGenerations.has(generation)
      ) {
        return;
      }
      if (bootstrappedGeneration === generation) {
        await restoreSessionPush(identity, generation);
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
      await restoreSessionPush(identity, generation);
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
        restoredPushGeneration = null;
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
        const { data, error } = await withDeadline(
          () => client.auth.getSession(),
          { timeoutMs: MEMBER_SESSION_READ_TIMEOUT_MS },
        );
        if (error) throw error;
        initialReadSettled = true;
        initialReadFailed = false;
        if (!active) return data.session;
        if (authRevision !== startedRevision) {
          const current = getMemberSessionSnapshot();
          return current.status === 'ready' ? current.session : null;
        }
        publishMemberSessionReady(data.session);
        updateSession(data.session, false);
        return data.session;
      } catch (error) {
        const superseded = authRevision !== startedRevision;
        initialReadSettled = true;
        if (superseded) {
          const current = getMemberSessionSnapshot();
          if (current.status === 'ready') return current.session;
        }
        initialReadFailed = true;
        if (active) publishMemberSessionError();
        throw error;
      }
    };

    const uninstallRefresh = installMemberSessionRefresh(readCurrentSession);
    void readCurrentSession().catch(() => undefined);

    const handleOnline = () => {
      if (currentSessionIdentity) queueBootstrap(currentSessionIdentity, sessionGeneration);
    };
    window.addEventListener('online', handleOnline);

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' && !session && (!initialReadSettled || initialReadFailed)) return;

      const current = getMemberSessionSnapshot();
      if ((event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && current.status === 'ready') {
        const currentUserId = current.session?.user?.id ?? null;
        const nextUserId = session?.user?.id ?? null;
        if (currentUserId !== nextUserId) return;
      }

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
      window.removeEventListener('online', handleOnline);
      subscription.unsubscribe();
    };
  }, [bootstrap, cleanupPush, restorePush, client, startTracking]);

  return null;
}
