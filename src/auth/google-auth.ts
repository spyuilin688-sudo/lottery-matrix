import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabase";

export async function signInWithGoogle(
  redirectTo = new URL("/", window.location.origin).href,
  client: SupabaseClient = getSupabaseClient(),
) {
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        prompt: "select_account",
      },
    },
  });
  if (error) throw error;
}
