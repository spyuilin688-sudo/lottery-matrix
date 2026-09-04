import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';
import {
  clearLineAuthEphemeralState,
  clearLineProviderToken,
  isLineProviderTokenRevokedFor,
  markLineProviderTokenRevokedFor,
  readLineProviderToken,
} from './line-provider-token';
import { cleanupBrowserPushSubscription } from '../push-subscription';
import { endActiveMemberOnlineSession } from '../member-online';
import { ApiRequestError, withDeadline } from '../lib/api-resilience';
import { logicalSessionIdentity } from './session-identity';

const SESSION_READ_TIMEOUT_MS = 2_500;
const LINE_REVOKE_TIMEOUT_MS = 5_000;
const CLEANUP_TIMEOUT_MS = 2_500;
const LOCAL_SIGN_OUT_TIMEOUT_MS = 8_000;

type PresenceRecovery = {
  generation: number;
  sessionIdentity: string | null;
  decision: 'pending' | 'resume' | 'discard';
  resumeOnline: (() => void) | null;
  invoked: boolean;
};

let presenceRecoveryGeneration = 0;
let pendingPresenceRecovery: PresenceRecovery | null = null;

function resumePresence(resumeOnline: (() => void) | null) {
  try {
    resumeOnline?.();
  } catch {
    // Preserve the sanitized sign-out failure even if presence cannot resume.
  }
}

function discardPendingPresenceRecovery() {
  if (pendingPresenceRecovery) pendingPresenceRecovery.decision = 'discard';
  pendingPresenceRecovery = null;
}

function maybeResumePresence(recovery: PresenceRecovery) {
  if (recovery.decision !== 'resume' || !recovery.resumeOnline || recovery.invoked) return;
  recovery.invoked = true;
  resumePresence(recovery.resumeOnline);
  if (pendingPresenceRecovery?.generation === recovery.generation) {
    pendingPresenceRecovery = null;
  }
}

export function reconcilePendingLineLogoutPresence(session: Session | null | undefined) {
  const recovery = pendingPresenceRecovery;
  if (!recovery || session === undefined) return;

  if (session === null || logicalSessionIdentity(session) !== recovery.sessionIdentity) {
    discardPendingPresenceRecovery();
    return;
  }

  recovery.decision = 'resume';
  maybeResumePresence(recovery);
}

function resolveApprovedRedirect(redirectTo: string, origin: string) {
  const approved = new URL('/', origin).href;
  const resolved = new URL(redirectTo, approved).href;
  if (resolved !== approved) throw new TypeError('LINE_RETURN_URL_NOT_ALLOWED');
  return approved;
}

export async function signInWithLine(
  redirectTo = new URL('/', window.location.origin).href,
  client: SupabaseClient = getSupabaseClient(),
) {
  const approvedRedirect = resolveApprovedRedirect(redirectTo, window.location.origin);
  const { error } = await client.auth.signInWithOAuth({
    provider: 'custom:line',
    options: { redirectTo: approvedRedirect },
  });

  if (error) throw error;
}

export async function signOutFromMatrix(
  client: SupabaseClient = getSupabaseClient(),
  revoke: (providerAccessToken: string) => Promise<void> = revokeLineProviderToken,
  cleanupPush: () => Promise<void> = cleanupBrowserPushSubscription,
  cleanupOnline: () => Promise<void | (() => void)> = endActiveMemberOnlineSession,
) {
  discardPendingPresenceRecovery();
  let session: Session | null = null;
  try {
    const { data, error: sessionError } = await withDeadline(
      () => client.auth.getSession(),
      { timeoutMs: SESSION_READ_TIMEOUT_MS },
    );
    if (!sessionError) session = data.session;
  } catch {
    // Provider session inspection is best-effort; local logout must remain available.
  }
  const accessToken = session?.access_token ?? null;
  const presenceRecovery: PresenceRecovery = {
    generation: ++presenceRecoveryGeneration,
    sessionIdentity: logicalSessionIdentity(session),
    decision: 'pending',
    resumeOnline: null,
    invoked: false,
  };
  const onlineCleanupResult = Promise.resolve().then(() => cleanupOnline());
  void onlineCleanupResult.then((resume) => {
    if (typeof resume !== 'function') return;
    presenceRecovery.resumeOnline = resume;
    maybeResumePresence(presenceRecovery);
  }, () => undefined);

  const revokeTask = async () => {
    if (!accessToken || isLineProviderTokenRevokedFor(accessToken)) return;
    const sessionProviderToken = session?.provider_token;
    const providerAccessToken = typeof sessionProviderToken === 'string' && sessionProviderToken.length > 0
      ? sessionProviderToken
      : readLineProviderToken();
    if (!providerAccessToken) return;
    try {
      await withDeadline(() => revoke(providerAccessToken), { timeoutMs: LINE_REVOKE_TIMEOUT_MS });
      clearLineProviderToken();
      markLineProviderTokenRevokedFor(accessToken);
    } catch {
      // LINE revocation is best-effort; never trap the user in the local session.
    }
  };
  const onlineTask = async () => {
    try {
      await withDeadline(() => onlineCleanupResult, { timeoutMs: CLEANUP_TIMEOUT_MS });
    } catch {
      // Presence cleanup is best-effort; local logout must remain available.
    }
  };
  const pushTask = async () => {
    try {
      await withDeadline(() => cleanupPush(), { timeoutMs: CLEANUP_TIMEOUT_MS });
    } catch {
      // Push cleanup is best-effort; local logout must remain available.
    }
  };

  await Promise.all([revokeTask(), onlineTask(), pushTask()]);

  try {
    const { error } = await withDeadline(
      () => client.auth.signOut({ scope: 'local' }),
      { timeoutMs: LOCAL_SIGN_OUT_TIMEOUT_MS },
    );
    if (error) throw error;
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === 'REQUEST_TIMEOUT') {
      let reconciledSession: Session | null;
      try {
        const { data, error: reconciliationError } = await withDeadline(
          () => client.auth.getSession(),
          { timeoutMs: SESSION_READ_TIMEOUT_MS },
        );
        if (reconciliationError) throw reconciliationError;
        reconciledSession = data.session;
      } catch {
        pendingPresenceRecovery = presenceRecovery;
        throw new Error('SUPABASE_SIGN_OUT_UNCERTAIN');
      }
      if (!reconciledSession) {
        presenceRecovery.decision = 'discard';
        clearLineAuthEphemeralState();
        return;
      }
      presenceRecovery.decision = 'resume';
      maybeResumePresence(presenceRecovery);
      throw new Error('SUPABASE_SIGN_OUT_FAILED');
    }
    presenceRecovery.decision = 'resume';
    maybeResumePresence(presenceRecovery);
    throw new Error('SUPABASE_SIGN_OUT_FAILED');
  }

  presenceRecovery.decision = 'discard';
  clearLineAuthEphemeralState();
}

export async function revokeLineProviderToken(
  providerAccessToken: string,
  client: SupabaseClient = getSupabaseClient(),
) {
  const { error } = await client.functions.invoke('line-logout', {
    body: { providerAccessToken },
  });
  if (error) throw new Error('LINE_PROVIDER_REQUEST_FAILED');
}
