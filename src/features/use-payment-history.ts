import { useEffect, useRef, useState } from 'react';
import { fetchMemberPaymentHistory, type MemberPaymentHistoryItem } from '../member-api';
import { requestMemberSessionRefresh, useMemberSessionSnapshot } from '../auth/member-session-store';

type PaymentHistoryState = { status: 'checking' | 'guest' | 'loading' | 'auth-error' | 'error' }
  | { status: 'ready'; history: MemberPaymentHistoryItem[] };
type PaymentOwner = { userId: string; active: boolean };

/** The shared member session owner gates this private read; the RPC remains the authorization authority. */
export function usePaymentHistory() {
  const memberSession = useMemberSessionSnapshot();
  const [state, setState] = useState<PaymentHistoryState>({ status: 'checking' });
  const [owner, setOwner] = useState<PaymentOwner | null>(null);
  const currentOwner = useRef<PaymentOwner | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshPending = useRef(false);
  const wasHidden = useRef(false);

  useEffect(() => {
    const invalidate = () => {
      if (currentOwner.current) currentOwner.current.active = false;
      currentOwner.current = null;
      setOwner(null);
      refreshPending.current = false;
      setRefreshing(false);
    };

    if (memberSession.status === 'checking') {
      invalidate();
      setState({ status: 'checking' });
      return;
    }
    if (memberSession.status === 'error') {
      invalidate();
      setState({ status: 'auth-error' });
      return;
    }

    const session = memberSession.session;
    const userId = session?.access_token && session.user?.id ? session.user.id : null;
    if (userId && currentOwner.current?.active && currentOwner.current.userId === userId) return;

    invalidate();
    if (!userId) {
      setState({ status: 'guest' });
      return;
    }

    const nextOwner = { userId, active: true };
    currentOwner.current = nextOwner;
    setOwner(nextOwner);
    setState({ status: 'loading' });
  }, [memberSession]);

  useEffect(() => {
    if (!owner?.active) return;
    const controller = new AbortController();
    const isCurrent = () => owner.active && currentOwner.current === owner && !controller.signal.aborted;
    void fetchMemberPaymentHistory().then((history) => {
      if (isCurrent()) setState({ status: 'ready', history });
    }).catch((error: unknown) => {
      if (!isCurrent()) return;
      if (error instanceof Error && error.message === 'MEMBER_SESSION_EXPIRED') {
        owner.active = false;
        currentOwner.current = null;
        setOwner(null);
        setState({ status: 'guest' });
      } else setState({ status: 'error' });
    }).finally(() => {
      if (isCurrent()) {
        refreshPending.current = false;
        setRefreshing(false);
      }
    });
    return () => controller.abort();
  }, [owner, reloadVersion]);

  const refresh = () => {
    if (state.status !== 'ready' || refreshPending.current || !currentOwner.current?.active
      || !state.history.some((item) => item.status === 'pending' && item.accountLastFive === null)) return;
    refreshPending.current = true;
    setRefreshing(true);
    setReloadVersion((version) => version + 1);
  };

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') wasHidden.current = true;
      if (document.visibilityState === 'visible' && wasHidden.current) {
        wasHidden.current = false;
        refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [state, refreshing]);

  const retry = () => {
    if (currentOwner.current) currentOwner.current.active = false;
    currentOwner.current = null;
    setOwner(null);
    setState({ status: 'checking' });
    void requestMemberSessionRefresh().catch(() => setState({ status: 'auth-error' }));
  };
  return { ...state, retry, refresh, refreshing };
}
