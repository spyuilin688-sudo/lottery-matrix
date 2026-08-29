import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const path = new URL("../supabase/migrations/20260830060000_manual_bank_transfer.sql", import.meta.url);

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
