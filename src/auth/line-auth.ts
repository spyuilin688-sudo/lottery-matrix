import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';
import {
  clearLineAuthEphemeralState,
  clearLineProviderToken,
  isLineProviderTokenRevokedFor,
  markLineProviderTokenRevokedFor,
  readLineProviderToken,
} from './line-provider-token';
import { cleanupBrowserPushSubscription } from '../push-subscription';

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
) {
  const { data, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;

  const session = data.session;
  const accessToken = session?.access_token ?? null;
  if (accessToken && !isLineProviderTokenRevokedFor(accessToken)) {
    const sessionProviderToken = session?.provider_token;
    const providerAccessToken = typeof sessionProviderToken === 'string' && sessionProviderToken.length > 0
      ? sessionProviderToken
      : readLineProviderToken();
    if (!providerAccessToken) throw new Error('LINE_PROVIDER_TOKEN_REQUIRED');

    await revoke(providerAccessToken);
    clearLineProviderToken();
    markLineProviderTokenRevokedFor(accessToken);
  }

  try {
    await cleanupPush();
  } catch {
    // Push cleanup is best-effort; local logout must remain available.
  }

  try {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
  } catch {
    throw new Error('SUPABASE_SIGN_OUT_FAILED');
  }

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
