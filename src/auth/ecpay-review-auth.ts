import { createEcpayReviewAuthClient, getSupabaseClient } from '../lib/supabase';
import { withDeadline } from '../lib/api-resilience';

// Verify the dedicated member before publishing a session to the application.
// The temporary client never writes tokens or credentials to browser storage.
export async function signInForEcpayReview(account: string, password: string, signal?: AbortSignal, onCommit: () => void = () => {}) {
  // A review username is only an Auth identity alias, never an administrator role.
  const email = account.trim() === 'admin' ? 'spyuilin688+ecpay@gmail.com' : account.trim();
  const session = await withDeadline(async (requestSignal) => {
    const client = createEcpayReviewAuthClient(requestSignal);
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error('REVIEW_LOGIN_FAILED');
    const access = await client.rpc('ecpay_review_access');
    if (access.error || access.data !== true || requestSignal.aborted) {
      void client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      throw new Error('REVIEW_LOGIN_FAILED');
    }
    return data.session;
  }, { signal });
  if (signal?.aborted) throw new Error('REVIEW_LOGIN_FAILED');
  // Publishing a shared Auth session is a commit point. Do not race it against
  // cancellation/deadlines: its own HTTP requests retain the shared fetch policy.
  onCommit();
  const result = await getSupabaseClient().auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (result.error) throw new Error('REVIEW_LOGIN_FAILED');
}
