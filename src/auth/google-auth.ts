import { getSupabaseClient } from "../lib/supabase";

export async function signInWithGoogle() {
  const redirectTo = new URL("/", window.location.origin).href;
  const { error } = await getSupabaseClient().auth.signInWithOAuth({
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
