import { useEffect, useRef } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';
import { bootstrapMember } from '../member-api';
import { clearLineAuthEphemeralState, rememberLineProviderToken } from './line-provider-token';
import { cleanupBrowserPushSubscription } from '../push-subscription';

type Props = {
  client?: SupabaseClient;
  bootstrap?: () => Promise<unknown>;
  cleanupPush?: () => Promise<void>;
};

function sessionAccessToken(session: Session | null) {
  return session?.access_token || null;
}

export function MemberSessionBridge({ client = getSupabaseClient(), bootstrap = bootstrapMember, cleanupPush = cleanupBrowserPushSubscription }: Props) {
  const bootstrappedTokens = useRef(new Set<string>());
  const processingTokens = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

    const bootstrapSession = async (session: Session | null) => {
      const accessToken = sessionAccessToken(session);
      if (!active || !accessToken || bootstrappedTokens.current.has(accessToken) || processingTokens.current.has(accessToken)) {
        return;
      }

      processingTokens.current.add(accessToken);
      try {
        await bootstrap();
        if (active) bootstrappedTokens.current.add(accessToken);
      } catch {
        // A later auth event may retry a failed member bootstrap.
      } finally {
        processingTokens.current.delete(accessToken);
      }
    };

    const queueBootstrap = (session: Session | null) => {
      const timer = setTimeout(() => {
        pendingTimers.delete(timer);
        void bootstrapSession(session);
      }, 0);
      pendingTimers.add(timer);
    };

    void client.auth.getSession().then(({ data, error }) => {
      if (!active || error) return;
      void bootstrapSession(data.session);
    }).catch(() => undefined);

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        clearLineAuthEphemeralState();
        void cleanupPush().catch(() => undefined);
      } else if (session?.provider_token) {
        rememberLineProviderToken(session.provider_token);
      }

      queueBootstrap(session);
    });

    return () => {
      active = false;
      pendingTimers.forEach((timer) => clearTimeout(timer));
      pendingTimers.clear();
      subscription.unsubscribe();
    };
  }, [bootstrap, cleanupPush, client]);

  return null;
}
