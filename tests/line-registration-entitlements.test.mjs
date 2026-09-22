import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migrationsUrl = new URL('../supabase/migrations/', import.meta.url);
const migrations = readdirSync(migrationsUrl)
  .filter(name => name.endsWith('.sql'))
  .sort()
  .reverse()
  .map(name => ({ name, sql: readFileSync(new URL(name, migrationsUrl), 'utf8') }));

const entitlementMigration = migrations
  .find(({ sql }) => /create or replace function private\.matrix_result_entitlements_for_member\(/i.test(sql));
const wrapperMigration = migrations
  .find(({ sql }) => /create or replace function private\.matrix_result_entitlements\(\)/i.test(sql));

assert.ok(entitlementMigration, 'expected a matrix entitlement helper migration');
assert.ok(wrapperMigration, 'expected a matrix entitlement wrapper migration');

const functionSql = (sql, name, sourceName) => {
  const escaped = name.replaceAll('.', '\\.');
  const match = sql.match(new RegExp(`create(?: or replace)? function ${escaped}\\([\\s\\S]*?\\$function\\$;`, 'i'));
  assert.ok(match, `missing function ${name} in ${sourceName}`);
  return match[0];
};

test('LINE registration grants 48h thirteen/full-range access without Tianyan or Tiangong trial', async t => {
  const db = new PGlite();
  t.after(() => db.close());

  await db.exec(`
    create schema private;
    create schema auth;
    create role anon;
    create role authenticated;
    create role service_role;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table public.members(
      id uuid primary key,
      auth_user_id uuid,
      status text,
      is_lifetime boolean default false,
      current_plan_id uuid,
      plan_expires_at timestamptz,
      referral_code text,
      invitation_code text,
      line_user_id text,
      line_trial_started_at timestamptz
    );
    create table public.plans(id uuid primary key, name text);
    create table public.payments(member_id uuid, status text);
    create table private.matrix_permission_settings(
      singleton boolean primary key,
      registered_member_free_access boolean
    );
    insert into private.matrix_permission_settings values(true, false);
    create function private.member_login_perks_eligible(uuid, text)
    returns boolean language sql stable as $$ select false $$;
  `);

  await db.exec(functionSql(
    entitlementMigration.sql,
    'private.matrix_result_entitlements_for_member',
    entitlementMigration.name,
  ));
  await db.exec(functionSql(
    wrapperMigration.sql,
    'private.matrix_result_entitlements',
    wrapperMigration.name,
  ));

  const member = '11111111-1111-1111-1111-111111111111';
  await db.query(`
    insert into public.members(
      id, auth_user_id, status, is_lifetime, line_trial_started_at
    ) values($1, $1, '啟用', false, now())
  `, [member]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [member]);

  const rights = async () => (await db.query('select private.matrix_result_entitlements() result')).rows[0].result;

  assert.deepEqual(await rights(), {
    canUseSeven: false,
    canUseThirteen: true,
    canUseFullRange: true,
    canUseTianyan: false,
    canUseTiangong: false,
    canViewFullStatus: false,
  });

  await db.exec("update public.members set line_trial_started_at = now() - interval '24 hours'");
  assert.equal((await rights()).canUseThirteen, true);
  assert.equal((await rights()).canUseFullRange, true);
  assert.equal((await rights()).canUseTianyan, false);
  assert.equal((await rights()).canUseTiangong, false);

  await db.exec("update public.members set line_trial_started_at = now() - interval '48 hours'");
  assert.equal((await rights()).canUseThirteen, false);
  assert.equal((await rights()).canUseFullRange, false);
  assert.equal((await rights()).canUseTianyan, false);
  assert.equal((await rights()).canUseTiangong, false);
});
