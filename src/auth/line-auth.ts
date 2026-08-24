import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';
import { MatrixApiError, matrixApiFetch } from '../matrix-api-client';
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
  const { data, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = data.session?.access_token ?? null;
  if (!accessToken) throw new MatrixApiError('AUTH_REQUIRED', 401);

  if (!isLineProviderTokenRevokedFor(accessToken)) {
    const sessionProviderToken = data.session?.provider_token;
    const providerAccessToken = typeof sessionProviderToken === 'string' && sessionProviderToken.length > 0
      ? sessionProviderToken
      : readLineProviderToken();
    if (!providerAccessToken) {
      throw new MatrixApiError('LINE_PROVIDER_TOKEN_REQUIRED', 400);
    }

    await revoke(providerAccessToken);
    clearLineProviderToken();
    markLineProviderTokenRevokedFor(accessToken);
  }

  try {
    const { error } = await client.auth.signOut();
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
