import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchWithPolicy } from './api-resilience';
import { createSupabaseAuthStorage } from './supabase-auth-storage';

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  || "https://wcimzbbapfrdotjsfyxa.supabase.co";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  || "sb_publishable_sJuiSZhS6bCOza_RGTMVPg_JFiVv0F8";
let client: SupabaseClient | null = null;

export function hasSupabaseConfig() {
  return Boolean(url && anonKey);
}

export function getSupabaseClient() {
  if (!url || !anonKey) throw new Error("SUPABASE_CONFIG_MISSING");
  const memberOnlineEndUrl = new URL(
    'rest/v1/rpc/member_online_end',
    url.endsWith('/') ? url : `${url}/`,
  ).href;

  client ??= createClient(url, anonKey, {
    db: {
      retry: false,
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: createSupabaseAuthStorage(),
    },
    global: {
      fetch: (input, init) => {
        const request = typeof Request !== 'undefined' && input instanceof Request ? input : undefined;
        const method = init?.method ?? request?.method;
        const isMemberOnlineEnd = method?.toUpperCase() === 'POST'
          && (request?.url ?? String(input)) === memberOnlineEndUrl;
        // A pagehide/visibilitychange end must survive the document being unloaded.
        return fetchWithPolicy(input, isMemberOnlineEnd ? { ...init, keepalive: true } : init);
      },
    },
  });

  return client;
}
