import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const original = readFileSync(new URL('../migrations/20260829090000_member_pwa_rpc.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/20260913193834_remove_win_notification_settings.sql', import.meta.url), 'utf8');
const db = new PGlite();
const ownerA = '00000000-0000-4000-8000-000000000001';
const ownerB = '00000000-0000-4000-8000-000000000002';
let legacy;
let expected;

function originalFunction(name) {
  const start = original.indexOf(`create or replace function ${name}(`);
  assert.notEqual(start, -1);
  const end = original.indexOf('$$;', original.indexOf('as $$', start)) + 3;
  return original.slice(start, end);
}

async function asOwner(id) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}
async function read() {
  return (await db.query('select public.member_notification_settings_get_20260829_impl() as settings')).rows[0].settings;
}
async function save(settings) {
  return (await db.query('select public.member_notification_settings_save_20260829_impl($1::jsonb) as settings', [JSON.stringify(settings)])).rows[0].settings;
}

before(async () => {
  await db.exec(`
    create schema private;
    create schema auth;
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.members (id uuid primary key, auth_user_id uuid unique);
    create table public.notification_settings (member_id uuid primary key, settings jsonb, updated_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create function private.active_member_id() returns uuid language plpgsql stable as $$
    declare member_id uuid;
    begin
      if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
      select id into member_id from public.members where auth_user_id=auth.uid();
      if member_id is null then raise exception 'FORBIDDEN'; end if;
      return member_id;
    end;
    $$;
    insert into public.members values ('${ownerA}', '${ownerA}'), ('${ownerB}', '${ownerB}');
  `);
  await db.exec(originalFunction('private.default_member_notification_settings'));
  for (const action of ['get', 'save']) {
    await db.exec(originalFunction(`public.member_notification_settings_${action}`)
      .replace(`public.member_notification_settings_${action}(`, `public.member_notification_settings_${action}_20260829_impl(`));
  }
  await db.exec(`
    revoke all on function private.default_member_notification_settings() from public, anon, authenticated;
    revoke all on function public.member_notification_settings_get_20260829_impl() from public, anon, authenticated;
    revoke all on function public.member_notification_settings_save_20260829_impl(jsonb) from public, anon, authenticated;
    grant execute on function public.member_notification_settings_get_20260829_impl() to service_role;
    grant execute on function public.member_notification_settings_save_20260829_impl(jsonb) to service_role;
  `);
  legacy = (await db.query('select private.default_member_notification_settings() as settings')).rows[0].settings;
  legacy.settings.bet = false;
  legacy.selectedOptions.result = ['天天樂'];
  legacy.betTimes['今彩539'] = ['19:30', '20:00'];
  expected = structuredClone(legacy);
  delete expected.settings.win;
  delete expected.selectedOptions.win;
  await db.query('insert into public.notification_settings (member_id,settings) values ($1,$2::jsonb)', [ownerA, JSON.stringify(legacy)]);
  await db.exec(migration);
});
after(async () => { await db.close(); });

test('defaults exclude both retired win preferences', async () => {
  const value = (await db.query('select private.default_member_notification_settings() as settings')).rows[0].settings;
  assert.equal(Object.hasOwn(value.settings, 'win'), false);
  assert.equal(Object.hasOwn(value.selectedOptions, 'win'), false);
  assert.deepEqual(Object.keys(value.settings).sort(), ['bet', 'card', 'collision', 'expiry', 'result', 'status', 'system']);
});

test('migration preserves every active preference while removing only retired keys', async () => {
  const row = (await db.query('select settings from public.notification_settings where member_id=$1', [ownerA])).rows[0];
  assert.deepEqual(row.settings, expected);
});

test('legacy saves and reads cannot reintroduce retired fields', async () => {
  await asOwner(ownerA);
  assert.deepEqual(await save(legacy), expected);
  assert.deepEqual(await read(), expected);
  await db.query('update public.notification_settings set settings=$1::jsonb where member_id=$2', [JSON.stringify(legacy), ownerA]);
  assert.deepEqual(await read(), expected);
  await save(expected);
});

test('new payloads persist only for the authenticated owner', async () => {
  await asOwner(ownerB);
  const settings = await read();
  settings.settings.result = false;
  assert.deepEqual(await save(settings), settings);
  await asOwner(ownerA);
  assert.deepEqual(await read(), expected);
});

test('unauthenticated and unknown owners cannot read or write', async () => {
  await asOwner('');
  await assert.rejects(read, /AUTH_REQUIRED/);
  await assert.rejects(() => save(expected), /AUTH_REQUIRED/);
  await asOwner('00000000-0000-4000-8000-000000000099');
  await assert.rejects(read, /FORBIDDEN/);
  await assert.rejects(() => save(expected), /FORBIDDEN/);
});

test('invalid root payloads remain rejected', async () => {
  await asOwner(ownerA);
  await assert.rejects(() => save({ settings: {} }), /INVALID_NOTIFICATION_SETTINGS/);
  assert.deepEqual(await read(), expected);
});

test('replacement functions preserve the existing service-only implementation permissions', async () => {
  const privileges = (await db.query(`select
    has_function_privilege('anon','public.member_notification_settings_get_20260829_impl()','EXECUTE') as anon_get,
    has_function_privilege('authenticated','public.member_notification_settings_save_20260829_impl(jsonb)','EXECUTE') as member_impl,
    has_function_privilege('service_role','public.member_notification_settings_save_20260829_impl(jsonb)','EXECUTE') as service_impl`)).rows[0];
  assert.deepEqual(privileges, { anon_get: false, member_impl: false, service_impl: true });
});
