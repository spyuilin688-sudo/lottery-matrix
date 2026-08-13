import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
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
