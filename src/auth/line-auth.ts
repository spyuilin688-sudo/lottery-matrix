import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';
import { matrixApiFetch } from '../matrix-api-client';
import {
  clearLineAuthEphemeralState,
  clearLineProviderToken,
  isLineProviderTokenRevokedFor,
  markLineProviderTokenRevokedFor,
  readLineProviderToken,
} from './line-provider-token';

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
) {
  let session: Awaited<ReturnType<SupabaseClient['auth']['getSession']>>['data']['session'] = null;
  try {
    const { data, error } = await client.auth.getSession();
    if (!error) session = data.session;
  } catch {
    // Local sign-out must remain available even if the current session cannot be read.
  }

  const accessToken = session?.access_token ?? null;
  if (accessToken && !isLineProviderTokenRevokedFor(accessToken)) {
    const sessionProviderToken = session?.provider_token;
    const providerAccessToken = typeof sessionProviderToken === 'string' && sessionProviderToken.length > 0
      ? sessionProviderToken
      : readLineProviderToken();
    if (providerAccessToken) {
      try {
        await revoke(providerAccessToken);
        clearLineProviderToken();
        markLineProviderTokenRevokedFor(accessToken);
      } catch {
        // LINE revocation is best-effort; it must not trap an iOS browser in a logged-in state.
      }
    }
  }

  try {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
  } catch {
    throw new Error('SUPABASE_SIGN_OUT_FAILED');
  }

  clearLineAuthEphemeralState();
}

export async function revokeLineProviderToken(providerAccessToken: string) {
  await matrixApiFetch<void>('/api/auth/line/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerAccessToken }),
  });
}
