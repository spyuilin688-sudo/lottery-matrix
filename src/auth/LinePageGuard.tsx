import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useAppDialog } from '../dialog/AppDialog';
import { withDeadline } from '../lib/api-resilience';
import { getSupabaseClient } from '../lib/supabase';
import type { Navigate } from '../features/navigation';
import { FeaturePageLoadState } from '../FeaturePageLoadBoundary';

function hasLineSession(session: Session | null) {
  return Boolean(session?.access_token && session.user && (
    session.user.app_metadata?.provider === 'custom:line'
    || session.user.identities?.some((identity) => identity.provider === 'custom:line')
  ));
}

/** Entry guard only; server-side feature permissions remain owned by their APIs. */
export function LinePageGuard({ title, onNavigate, children }: {
  title: string;
  onNavigate: Navigate;
  children: ReactNode;
}) {
  const { alert } = useAppDialog();
  const [access, setAccess] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;

  useEffect(() => {
    let active = true;
    let authEventObserved = false;
    let denied = false;
    const controller = new AbortController();
    const client = getSupabaseClient();

    const deny = (failed = false) => {
      if (!active || denied) return;
      denied = true;
      setAccess('denied');
      void alert(failed ? {
        title: '登入狀態確認失敗',
        description: '請稍後再試一次。',
      } : {
        title: '請先登入',
        description: `請先使用 LINE 登入後再進入「${title}」。`,
      });
      navigateRef.current('home');
    };
    const acceptSession = (session: Session | null) => {
      if (!active || denied) return;
      if (hasLineSession(session)) setAccess('allowed');
      else deny();
    };

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      authEventObserved = true;
      acceptSession(event === 'SIGNED_OUT' ? null : session);
    });
    void withDeadline(() => client.auth.getSession(), { signal: controller.signal }).then(({ data, error }) => {
      if (!active || authEventObserved) return;
      if (error) deny(true);
      else acceptSession(data.session);
    }).catch(() => {
      if (active && !authEventObserved) deny(true);
    });

    return () => {
      active = false;
      controller.abort();
      subscription.unsubscribe();
    };
  }, [alert, title]);

  if (access === 'allowed') return children;
  return access === 'checking' ? <FeaturePageLoadState onHome={() => onNavigate('home')} /> : null;
}
