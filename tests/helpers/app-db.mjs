import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const migrations = new URL('../../supabase/migrations/', import.meta.url);
export const readMigration = name => readFile(new URL(name, migrations), 'utf8');

// Load the real function body, not a test reimplementation of its behavior.
export async function installFunction(db, file, name) {
  const sql = await readMigration(file);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = sql.match(new RegExp(`create(?: or replace)? function ${escaped}\\s*\\([\\s\\S]*?\\bas\\s+(\\$[\\w]*\\$)[\\s\\S]*?\\1`, 'i'));
  assert.ok(match, `Missing existing definition ${name} in ${file}`);
  await db.exec(`${match[0]};`);
}

export async function createAppDb({ applyApp = true, database = null } = {}) {
  const db = database ?? new PGlite();
  // Auth is a platform fixture; these table projections include every column
  // consumed by the actual membership/login functions under test.
  await db.exec(`
    do $$begin create role anon; exception when duplicate_object then null; end$$;
    do $$begin create role authenticated; exception when duplicate_object then null; end$$;
    do $$begin create role service_role bypassrls; exception when duplicate_object then null; end$$;
    create schema auth; create schema private;
    grant usage on schema public, auth to authenticated, anon, service_role;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create table auth.identities(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users,
      provider text,provider_id text,identity_data jsonb default '{}',created_at timestamptz default now());
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users,
      not_after timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),ip inet);
    create function auth.jwt() returns jsonb language sql stable as
      $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    create table public.plans(id uuid primary key default gen_random_uuid(),name text,price integer);
    create table public.members(id uuid primary key default gen_random_uuid(),auth_user_id uuid unique not null references auth.users on delete cascade,
      line_user_id text unique,registered_at timestamptz default now(),status text default '啟用',
      current_plan_id uuid references public.plans,plan_started_at timestamptz,plan_expires_at timestamptz,
      is_lifetime boolean default false,referral_code text,invitation_code text);
    create table public.payments(id uuid primary key default gen_random_uuid(),member_id uuid references public.members,
      amount integer,status text);
  `);
  await db.exec(await readMigration('20260824190505_sync_line_members_from_auth.sql'));
  await db.exec(await readMigration('20260824192549_sync_line_display_names.sql'));
  await db.exec(await readMigration('20260824192630_sync_line_identity_profile_updates.sql'));
  await db.exec('alter table public.members add column line_trial_started_at timestamptz;');
  await installFunction(db, '20260908035518_line_registration_algorithm_trials.sql', 'private.initialize_line_registration_trial');
  await db.exec('create trigger initialize_line_registration_trial before insert on public.members for each row execute function private.initialize_line_registration_trial();');
  await installFunction(db, '20260829213702_fix_member_coalesce.sql', 'private.bootstrap_member_allowed');
  await installFunction(db, '20260915114856_allow_google_member_bootstrap.sql', 'public.member_bootstrap_20260829_impl');
  await installFunction(db, '20260829192625_security_review_fixes.sql', 'public.member_bootstrap');
  await db.exec('revoke all on function public.member_bootstrap_20260829_impl() from public,anon,authenticated;');
  await db.exec(await readMigration('20260907045216_member_login_history.sql'));
  if (applyApp) await applyAppMigrations(db, ['app_product_membership']);
  return db;
}

export async function applyAppMigrations(db, names) {
  const files = (await readdir(migrations)).sort();
  for (const name of names) {
    const matches = files.filter(file => file.endsWith(`_${name}.sql`));
    assert.ok(matches.length <= 1, `Ambiguous migration ${name}`);
    if (matches[0]) await db.exec(await readMigration(matches[0]));
  }
}

export async function identity(db, { user = randomUUID(), session = randomUUID(), provider = 'custom:line', providerId = randomUUID(), name = 'App fixture member' } = {}) {
  await db.query('insert into auth.users(id) values($1) on conflict do nothing', [user]);
  await db.query('insert into auth.identities(user_id,provider,provider_id,identity_data) values($1,$2,$3,$4)', [user, provider, providerId, { name }]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [session, user]);
  return { user, session };
}

export async function asUser(db, actor, body) {
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: actor.user, session_id: actor.session, role: 'authenticated' })]);
  await db.exec('set role authenticated');
  try { return await body(); }
  finally { await db.exec('reset role'); await db.exec("select set_config('request.jwt.claims','{}',false)"); }
}

export async function rpc(db, name, args = []) {
  assert.match(name, /^[a-z_]+$/);
  const exists = await db.query('select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname=$2', ['public', name]);
  assert.equal(exists.rows[0].n, 1, `Expected app contract ${name} to exist`);
  const result = await db.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as value`, args);
  return result.rows[0].value;
}

export async function pwaSnapshot(db) {
  const result = {};
  for (const table of ['members','plans','payments']) result[table] = (await db.query(`select * from public.${table} order by id`)).rows;
  return result;
}
