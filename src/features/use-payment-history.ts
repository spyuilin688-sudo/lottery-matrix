import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { withDeadline } from '../lib/api-resilience';
import { getSupabaseClient } from '../lib/supabase';
import { fetchMemberPaymentHistory, type MemberPaymentHistoryItem } from '../member-api';

type PaymentHistoryState = { status: 'checking' | 'guest' | 'loading' | 'auth-error' | 'error' }
  | { status: 'ready'; history: MemberPaymentHistoryItem[] };
type PaymentOwner = { userId: string; active: boolean };

/** Session checks gate this private read; the RPC remains the authorization authority. */
export function usePaymentHistory() {
  const [state, setState] = useState<PaymentHistoryState>({ status: 'checking' });
  const [owner, setOwner] = useState<PaymentOwner | null>(null);
  const currentOwner = useRef<PaymentOwner | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let authEventObserved = false;
    let resolved = false;
    const ownerId = (session: Session | null) => session?.access_token && session.user?.id
      ? session.user.id : null;
    const accept = (session: Session | null) => {
      if (controller.signal.aborted) return;
      resolved = true;
      const userId = ownerId(session);
      if (userId && currentOwner.current?.active && currentOwner.current.userId === userId) return;
      // Invalidate before React effects run, so late responses cannot restore another member's data.
      if (currentOwner.current) currentOwner.current.active = false;
      currentOwner.current = userId ? { userId, active: true } : null;
      setOwner(currentOwner.current);
      setState({ status: userId ? 'loading' : 'guest' });
    };
    const fail = () => {
      if (!controller.signal.aborted && !authEventObserved) setState({ status: 'auth-error' });
    };

    let unsubscribe: (() => void) | undefined;
    try {
      const client = getSupabaseClient();
      const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
        if (controller.signal.aborted) return;
        if (event === 'INITIAL_SESSION' && (resolved || authEventObserved || !session)) return;
        if ((event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && resolved
          && ownerId(session) !== (currentOwner.current?.userId ?? null)) return;
        authEventObserved = true;
        accept(event === 'SIGNED_OUT' ? null : session);
      });
      unsubscribe = () => subscription.unsubscribe();
      void withDeadline(() => client.auth.getSession(), { signal: controller.signal }).then(({ data, error }) => {
        if (controller.signal.aborted || authEventObserved) return;
        if (error) fail();
        else accept(data.session);
      }).catch(fail);
    } catch { fail(); }

    return () => {
      if (currentOwner.current) currentOwner.current.active = false;
      controller.abort();
      unsubscribe?.();
    };
  }, [attempt]);

  useEffect(() => {
    if (!owner?.active) return;
    const controller = new AbortController();
    const isCurrent = () => owner.active && currentOwner.current === owner && !controller.signal.aborted;
    // Run outside onAuthStateChange so the SDK can release its auth lock first.
    void withDeadline(() => {
      if (!isCurrent()) throw new Error('PAYMENT_READ_SUPERSEDED');
      return fetchMemberPaymentHistory();
    }, { signal: controller.signal }).then((history) => {
      if (isCurrent()) setState({ status: 'ready', history });
    }).catch((error: unknown) => {
      if (!isCurrent()) return;
      if (error instanceof Error && error.message === 'MEMBER_SESSION_EXPIRED') {
        owner.active = false;
        currentOwner.current = null;
        setOwner(null);
        setState({ status: 'guest' });
      } else setState({ status: 'error' });
    });
    return () => controller.abort();
  }, [owner]);

  const retry = () => {
    if (currentOwner.current) currentOwner.current.active = false;
    currentOwner.current = null;
    setOwner(null);
    setState({ status: 'checking' });
    setAttempt((value) => value + 1);
  };
  return { ...state, retry };
}
