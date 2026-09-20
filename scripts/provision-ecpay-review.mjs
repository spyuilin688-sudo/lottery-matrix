// Run only in a trusted server environment. Never commit or log these inputs.
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ECPAY_REVIEW_EMAIL, ECPAY_REVIEW_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ECPAY_REVIEW_EMAIL || !ECPAY_REVIEW_PASSWORD) {
  throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ECPAY_REVIEW_EMAIL and ECPAY_REVIEW_PASSWORD in the trusted process environment.');
}
const email = ECPAY_REVIEW_EMAIL.trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || ECPAY_REVIEW_PASSWORD.length < 16) {
  throw new Error('Use a valid dedicated email and a password of at least 16 characters.');
}
const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = await client.from('admin_accounts').select('id').ilike('account', email);
if (admin.error || admin.data.length || email === 'spyuilin688@gmail.com') {
  throw new Error('A review account must be separate from administrator accounts.');
}
const created = await client.auth.admin.createUser({
  email,
  password: ECPAY_REVIEW_PASSWORD,
  email_confirm: true,
  app_metadata: { ecpay_review: true },
  user_metadata: { name: '綠界審核' },
});
if (created.error || !created.data.user) throw new Error('Review account creation failed; existing accounts were not modified.');
const member = await client.from('members').upsert({
  auth_user_id: created.data.user.id,
  is_lifetime: true,
  status: '啟用',
}, { onConflict: 'auth_user_id' }).select('id,is_lifetime,status').single();
if (member.error || !member.data?.is_lifetime || member.data.status !== '啟用') {
  const rollback = await client.auth.admin.deleteUser(created.data.user.id);
  throw new Error(rollback.error ? 'Provisioning failed; remove the newly created review Auth account before retrying.' : 'Provisioning failed; the newly created Auth account was removed.');
}
console.log('Review member created with full member access. Button visibility was not changed.');
