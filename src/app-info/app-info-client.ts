import { createClient, type SupabaseClient } from '@supabase/supabase-js';
let client: SupabaseClient | undefined;
export function getAppInfoClient() {
  client ??= createClient(import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://wcimzbbapfrdotjsfyxa.supabase.co', import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || 'sb_publishable_sJuiSZhS6bCOza_RGTMVPg_JFiVv0F8', {
    auth: { storageKey: 'matrix-app-deletion-auth', flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    db: { retry: false },
  });
  return client;
}
