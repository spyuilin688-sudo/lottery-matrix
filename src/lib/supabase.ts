import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

  client ??= createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return client;
}
