import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useAppDialog } from '../dialog/AppDialog';
import { withDeadline } from '../lib/api-resilience';
import { getSupabaseClient } from '../lib/supabase';
import type { Navigate, ScreenId } from '../features/navigation';
import { FeaturePageLoadState } from '../FeaturePageLoadBoundary';
import { FeatureShell } from '../features/shared';

function hasLineSession(session: Session | null) {
  return Boolean(session?.access_token && session.user && (
    session.user.app_metadata?.provider === 'custom:line'
    || session.user.identities?.some((identity) => identity.provider === 'custom:line')
  ));
}

/** Check before changing the screen or shortcut state, so denial keeps the origin. */
export function useLinePageEntry() {
  const { alert } = useAppDialog();
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, []);

  return (next: ScreenId, enter: () => void) => {
    pending.current?.abort();
    pending.current = null;
    const title = next === 'notebook' ? 'Matrix 筆記本' : next === 'status-settings' ? '自訂觸發條件' : null;
    if (!title) { enter(); return; }

    const controller = new AbortController();
    pending.current = controller;
    const client = getSupabaseClient();
    let authEventObserved = false;
    let latestSession: Session | null = null;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      authEventObserved = true;
      latestSession = event === 'SIGNED_OUT' ? null : session;
    });
    void withDeadline(() => client.auth.getSession(), { signal: controller.signal }).then(({ data, error }) => {
      if (controller.signal.aborted) return;
      if (error && !authEventObserved) throw error;
      if (hasLineSession(authEventObserved ? latestSession : data.session)) enter();
      else void alert({ title: '請先登入', description: `請先登入後再使用 ${title}` });
    }).catch(() => {
      if (!controller.signal.aborted) void alert({ title: '登入狀態確認失敗', description: '請稍後再試一次。' });
    }).finally(() => {
      subscription.unsubscribe();
      if (pending.current === controller) pending.current = null;
    });
  };
}

/** Entry guard only; server-side feature permissions remain owned by their APIs. */
export function LinePageGuard({ title, onNavigate, children }: {
  title: string;
  onNavigate: Navigate;
  children: ReactNode;
}) {
  const { alert } = useAppDialog();
  const [access, setAccess] = useState<'checking' | 'allowed' | 'denied'>('checking');

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
        description: `請先登入後再使用 ${title}`,
      });
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
  if (access === 'checking') return <FeaturePageLoadState onHome={() => onNavigate('home')} />;
  return <FeatureShell title={title} onNavigate={onNavigate} active={title === 'Matrix 筆記本' ? '快捷' : '首頁'}>
    <p className="empty-result">請先登入後再使用 {title}</p>
  </FeatureShell>;
}
