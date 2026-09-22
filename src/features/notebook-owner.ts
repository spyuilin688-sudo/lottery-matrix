import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { hasMemberSession, useGuardedMemberSession } from '../auth/LinePageGuard';
import { withDeadline } from '../lib/api-resilience';
import { getSupabaseClient } from '../lib/supabase';

export type NotebookOwner = { userId: string; revision: number; active: boolean };
type OwnerState = { status: 'checking' | 'signed-out' | 'error'; owner: null }
  | { status: 'ready'; owner: NotebookOwner };

function sessionOwnerId(session: Session | null) {
  return hasMemberSession(session)
    && typeof session?.user.id === 'string' && session.user.id.trim()
    ? session.user.id : null;
}

/** Match the member page guard; only the session's stable user id owns local notebook data. */
export function useNotebookOwner() {
  const guardedSession = useGuardedMemberSession();
  const guardedUserId = guardedSession === undefined ? undefined : sessionOwnerId(guardedSession);
  const [state, setState] = useState<OwnerState>({ status: 'checking', owner: null });
  const [attempt, setAttempt] = useState(0);
  const current = useRef<NotebookOwner | null>(null);
  const revision = useRef(0);

  useEffect(() => {
    if (guardedUserId !== undefined) {
      if (current.current?.active && current.current.userId === guardedUserId) {
        setState({ status: 'ready', owner: current.current });
        const owner = current.current;
        return () => {
          if (current.current === owner) owner.active = false;
        };
      }

      if (current.current) current.current.active = false;
      const owner = guardedUserId
        ? { userId: guardedUserId, revision: ++revision.current, active: true }
        : null;
      current.current = owner;
      setState(owner ? { status: 'ready', owner } : { status: 'signed-out', owner: null });

      return () => {
        if (owner && current.current === owner) owner.active = false;
      };
    }

    const controller = new AbortController();
    let authEventObserved = false;
    let resolved = false;
    const accept = (session: Session | null) => {
      if (controller.signal.aborted) return;
      resolved = true;
      const userId = sessionOwnerId(session);
      if (userId && current.current?.active && current.current.userId === userId) return;
      // Invalidate synchronously, before React renders the next account or unmounts its dialogs.
      if (current.current) current.current.active = false;
      current.current = userId ? { userId, revision: ++revision.current, active: true } : null;
      setState(current.current ? { status: 'ready', owner: current.current } : { status: 'signed-out', owner: null });
    };
    const fail = () => {
      if (controller.signal.aborted || authEventObserved) return;
      setState({ status: 'error', owner: null });
    };

    let unsubscribe: (() => void) | undefined;
    try {
      const client = getSupabaseClient();
      const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
        if (controller.signal.aborted) return;
        if (event === 'INITIAL_SESSION' && (authEventObserved || resolved)) return;
        // A delayed token/user refresh cannot sign back in or switch the current owner.
        if ((event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && resolved
          && sessionOwnerId(session) !== (current.current?.userId ?? null)) return;
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
      if (current.current) current.current.active = false;
      controller.abort();
      unsubscribe?.();
    };
  }, [attempt, guardedUserId]);

  return { ...state, retry: () => { setState({ status: 'checking', owner: null }); setAttempt((value) => value + 1); } };
}
