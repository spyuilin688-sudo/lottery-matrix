import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const path = new URL("../supabase/migrations/20260830060000_manual_bank_transfer.sql", import.meta.url);
const migrations = new URL("../supabase/migrations/", import.meta.url);

async function readMigration(suffix) {
  const file = (await readdir(migrations)).find((entry) => entry.endsWith(`_${suffix}.sql`));
  assert.ok(file, `missing migration for ${suffix}`);
  return readFile(new URL(file, migrations), "utf8");
}

test("manual transfer RPCs enforce server-owned member, amount and time", async () => {
  const sql = await readFile(path, "utf8");
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /pg_catalog\.now\(\)/);
  assert.match(sql, /select[\s\S]+price[\s\S]+duration_days[\s\S]+from public\.plans/i);
  assert.match(sql, /account_last_five[\s\S]+\^\[0-9\]\{5\}\$/);
  assert.match(sql, /where status = 'pending'/);
  assert.match(sql, /create unique index[\s\S]+transfer_requests[\s\S]+member_id[\s\S]+where status = 'pending'/i);
});

test("manual confirmation keeps auto renewal disabled and writes payment once", async () => {
  const sql = await readFile(path, "utf8");
  assert.match(sql, /auto_renew = false/);
  assert.match(sql, /insert into public\.payments/);
  assert.match(sql, /transfer_request_id/);
  assert.match(sql, /status <> 'pending'/);
});

test("RPC privileges are limited to authenticated users and checked administrators", async () => {
  const sql = await readFile(path, "utf8");
  assert.match(sql, /revoke all on function public\.member_transfer_request_submit[\s\S]+from public, anon/i);
  assert.match(sql, /grant execute on function public\.member_transfer_request_submit[\s\S]+to authenticated/i);
  assert.match(sql, /if not public\.is_admin\(\)/);
});

test("admin transfer approval RPC is tracked and restricted to the backend service", async () => {
  const sql = await readMigration("admin_transfer_review_rpc");
  assert.match(sql, /create or replace function public\.admin_review_transfer_request\(/i);
  assert.match(sql, /p_transfer_id uuid[\s\S]+p_decision text[\s\S]+p_now timestamp with time zone[\s\S]+p_actor_id uuid[\s\S]+p_actor_name text/i);
  assert.match(sql, /insert into public\.payments/);
  assert.match(sql, /update public\.members/);
  assert.match(sql, /revoke all on function public\.admin_review_transfer_request\([^)]*\)\s+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.admin_review_transfer_request\([^)]*\)\s+to service_role/i);
});
