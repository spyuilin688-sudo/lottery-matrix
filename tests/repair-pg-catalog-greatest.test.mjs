import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260902190446_repair_pg_catalog_greatest.sql",
    import.meta.url,
  ),
  "utf8",
);

const guardMigrationName = "20260902190724_repair_qualified_sql_constructs.sql";
const guardMigration = readFileSync(
  new URL(`../supabase/migrations/${guardMigrationName}`, import.meta.url),
  "utf8",
);
const auditMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260902190849_repair_admin_transfer_audit_actor.sql",
    import.meta.url,
  ),
  "utf8",
);

test("修復會員在線結束與轉帳確認函式的 GREATEST 呼叫", () => {
  assert.match(
    migration,
    /create or replace function public\.member_online_end_20260829_impl\(p_session_id uuid\)/i,
  );
  assert.match(
    migration,
    /create or replace function public\.admin_transfer_request_review\(\s*p_transfer_id uuid,\s*p_decision text\s*\)/i,
  );
  assert.doesNotMatch(migration, /pg_catalog\.greatest/i);
  assert.match(migration, /\bgreatest\s*\(/i);
  assert.match(
    migration,
    /revoke all on function public\.member_online_start\(\) from public, anon/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.member_online_end\(uuid\) from public, anon/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.member_online_(?:start\(\)|end\(uuid\)) to authenticated/i,
  );
});

const historicalProfileName = "20260916014316_member_profile_member_id.sql";
const profileRepairName = "20260916161223_fix_member_profile_coalesce.sql";

test("修復並阻止未修補的 schema-qualified SQL constructs 進入後續 migration", () => {
  assert.match(guardMigration, /greatest\|least\|coalesce\|nullif/i);
  assert.match(guardMigration, /BROKEN_QUALIFIED_SQL_CONSTRUCT_REMAINS/);

  const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
  const laterMigrations = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith(".sql") && name > guardMigrationName)
    .map((name) => ({
      name,
      source: readFileSync(new URL(name, migrationsDirectory), "utf8"),
    }));

  for (const { name, source } of laterMigrations) {
    if (name === historicalProfileName) {
      // This applied historical mistake is followed by a recorded repair.
      // The runtime test below must prove both the failure and the repair.
      assert.match(source, /pg_catalog\.coalesce\(plan\.name/);
      assert.ok(profileRepairName > name);
      assert.ok(laterMigrations.some((row) => row.name === profileRepairName));
      continue;
    }
    assert.doesNotMatch(
      source,
      /pg_catalog\.(greatest|least|coalesce|nullif)\s*\(/i,
      `${name} 不可把 SQL construct 當成 pg_catalog 函式`,
    );
  }
});

test("正式歷史的會員 coalesce 錯誤由後續 migration 修復", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create schema private;
    create function private.active_member_id() returns uuid language sql as $$select '11111111-1111-1111-1111-111111111111'::uuid$$;
    create table public.members(id uuid, line_user_id text, current_plan_id uuid, is_lifetime boolean, plan_expires_at timestamptz);
    create table public.plans(id uuid, name text);
    insert into public.members values('11111111-1111-1111-1111-111111111111','line-test',null,false,null);`);
  await db.exec(readFileSync(new URL(`../supabase/migrations/${historicalProfileName}`, import.meta.url), "utf8"));
  await assert.rejects(db.query('select public.member_profile_20260829_impl()'), /pg_catalog\.coalesce/);
  await db.exec(readFileSync(new URL('../supabase/migrations/20260916161223_fix_member_profile_coalesce.sql', import.meta.url), "utf8"));
  const { rows } = await db.query('select public.member_profile_20260829_impl() as profile');
  assert.deepEqual(rows[0].profile, {
    memberId: '11111111-1111-1111-1111-111111111111', lineUserId: 'line-test',
    planName: '免費會員', planExpiresAt: null, isLifetime: false,
  });
});

test("轉帳審核以 admin_accounts 主鍵寫入 audit_logs", () => {
  assert.match(auditMigration, /from auth\.users as auth_user/i);
  assert.match(
    auditMigration,
    /pg_catalog\.lower\(admin_account\.account\)\s*=\s*pg_catalog\.lower\(auth_user\.email\)/i,
  );
  assert.match(auditMigration, /v_actor_account_id/i);
  assert.match(auditMigration, /ADMIN_ACCOUNT_NOT_FOUND/i);
  assert.doesNotMatch(auditMigration, /admin_id[^\n]*v_auth_user_id/i);
});
