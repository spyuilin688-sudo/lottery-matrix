import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';

export async function signInWithLine(
  redirectTo = window.location.origin,
  client: SupabaseClient = getSupabaseClient(),
) {
  const { error } = await client.auth.signInWithOAuth({
    provider: 'custom:line',
    options: { redirectTo },
  });

  if (error) throw error;
}

export async function signOutFromMatrix(
  client: SupabaseClient = getSupabaseClient(),
) {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
