import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = new URL(
  '../supabase/migrations/20260830144700_mobile_push_notifications.sql',
  import.meta.url,
);

test('mobile push migration isolates subscriptions by authenticated auth user', async () => {
  const sql = await readFile(migration, 'utf8');

  assert.match(sql, /create table public\.member_push_subscriptions[\s\S]*?user_id uuid not null references auth\.users\(id\) on delete cascade[\s\S]*?unique \(endpoint\)/i);
  assert.match(sql, /alter table public\.member_push_subscriptions enable row level security/i);
  assert.match(sql, /create policy "Authenticated users can read their own push subscriptions"[\s\S]*?for select[\s\S]*?to authenticated[\s\S]*?\(select auth\.uid\(\)\) = user_id/i);
  assert.match(sql, /revoke all on table public\.member_push_subscriptions from public, anon/i);
  assert.match(sql, /grant select on table public\.member_push_subscriptions to authenticated/i);
  assert.doesNotMatch(sql, /grant select, insert, update, delete on table public\.member_push_subscriptions to authenticated/i);
});

test('mobile push migration keeps delivery-log writes server-only', async () => {
  const sql = await readFile(migration, 'utf8');

  assert.match(sql, /create table public\.push_delivery_logs[\s\S]*?subscription_id uuid references public\.member_push_subscriptions\(id\) on delete set null[\s\S]*?status text not null check \(status in \('sent', 'failed'\)\)[\s\S]*?admin_account text not null/i);
  assert.match(sql, /alter table public\.push_delivery_logs enable row level security/i);
  assert.match(sql, /revoke all on table public\.push_delivery_logs from public, anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.push_delivery_logs to service_role/i);
});

test('mobile push member RPCs derive the subscription owner from auth.uid', async () => {
  const sql = await readFile(migration, 'utf8');

  assert.match(sql, /create function public\.member_push_subscription_status\(p_endpoint text\)[\s\S]*?auth\.uid\(\)[\s\S]*?endpoint = p_endpoint/i);
  assert.match(sql, /create function public\.member_push_subscription_save\(p_endpoint text, p_p256dh text, p_auth text\)[\s\S]*?auth\.uid\(\)/i);
  assert.match(sql, /create function public\.member_push_subscription_disable\(p_endpoint text\)[\s\S]*?auth\.uid\(\)/i);
  assert.match(sql, /on conflict \(endpoint\) do update[\s\S]*?set user_id = excluded\.user_id/i);
  assert.match(sql, /revoke all on function public\.member_push_subscription_status\(text\) from public, anon/i);
  assert.match(sql, /revoke all on function public\.member_push_subscription_save\(text, text, text\) from public, anon/i);
  assert.match(sql, /revoke all on function public\.member_push_subscription_disable\(text\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.member_push_subscription_status\(text\) to authenticated/i);
  assert.match(sql, /grant execute on function public\.member_push_subscription_save\(text, text, text\) to authenticated/i);
  assert.match(sql, /grant execute on function public\.member_push_subscription_disable\(text\) to authenticated/i);
});
