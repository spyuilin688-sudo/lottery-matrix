import { PGlite } from '@electric-sql/pglite';
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';

const db = new PGlite();
const migration = new URL('../../../supabase/migrations/20260921065325_admin_push_member_page.sql', import.meta.url);
beforeAll(async () => {
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
    create table members (id uuid primary key, auth_user_id uuid, line_user_id text, line_display_name text);
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
    create table auth.identities (id uuid primary key, user_id uuid, provider text, provider_id text, identity_data jsonb, created_at timestamptz);
    insert into members select md5(i::text)::uuid, md5(i::text)::uuid, null, null from generate_series(1, 1205) i;
    insert into auth.users select auth_user_id, jsonb_build_object('full_name', 'Google 會員 ' || id::text) from members;
    insert into auth.identities values (md5('identity')::uuid, md5('1205')::uuid, 'google', 'google-late-recipient', '{"name":"fallback identity"}', now());
  `);
  if (existsSync(migration)) await db.exec(readFileSync(migration, 'utf8'));
}, 30000);
afterAll(async () => { await db.close(); });
async function page(keyword: string, page = 1) {
  return (await db.query<{ result: { items: { auth_user_id: string; line_display_name: string | null }[]; total: number; currentPage: number; totalPages: number } }>('select public.admin_push_member_page($1, $2) as result', [keyword, page])).rows[0].result;
}
it('searches all Google fallback names while returning only the requested 30-recipient page', async () => {
  const result = await page('Google 會員', 35);
  const expected = await db.query<{ auth_user_id: string }>('select auth_user_id from members order by auth_user_id limit 30 offset 1020');
  expect(result).toMatchObject({ total: 1205, currentPage: 35, totalPages: 41 });
  expect(result.items.map(item => item.auth_user_id)).toEqual(expected.rows.map(row => row.auth_user_id));
  expect(Object.keys(result.items[0]).sort()).toEqual(['auth_user_id', 'line_display_name', 'line_user_id']);
});
it('finds provider IDs beyond the first page and clamps an out-of-range page', async () => {
  const result = await page('google-late-recipient', 999);
  expect(result).toMatchObject({ total: 1, currentPage: 1, totalPages: 1 });
  expect(result.items).toHaveLength(1);
});
it('treats wildcard characters literally and returns an empty bounded envelope', async () => {
  expect(await page('%')).toEqual({ items: [], total: 0, currentPage: 1, totalPages: 1 });
});
it('uses persisted names first and identity names as the last fallback', async () => {
  await db.exec(`update members set line_display_name='Stored name' where auth_user_id=md5('1205')::uuid`);
  expect((await page('Stored name')).total).toBe(1);
  expect((await page('Google 會員')).total).toBe(1204);
  await db.exec(`update members set line_display_name=null where auth_user_id=md5('1205')::uuid;
    update auth.users set raw_user_meta_data='{}' where id=md5('1205')::uuid`);
  expect((await page('fallback identity')).total).toBe(1);
});
it('rejects invalid input and denies member and anonymous RPC access', async () => {
  await expect(page('a', 0)).rejects.toThrow('INVALID_REQUEST');
  await expect(page('a'.repeat(201))).rejects.toThrow('INVALID_REQUEST');
  const grants = await db.query<{ role: string; allowed: boolean }>(`select role, has_function_privilege(role, 'public.admin_push_member_page(text,bigint)', 'execute') allowed from (values ('anon'), ('authenticated'), ('service_role')) roles(role)`);
  expect(grants.rows).toEqual([{ role: 'anon', allowed: false }, { role: 'authenticated', allowed: false }, { role: 'service_role', allowed: true }]);
});

it('resolves a bounded log-name batch with Google fallback and service-only grants', async () => {
  const userId = (await db.query<{ id: string }>("select md5('1200')::uuid as id")).rows[0].id;
  const result = await db.query<{ result: { user_id: string; display_name: string }[] }>('select public.admin_push_log_member_names($1::uuid[]) as result', [[userId]]);
  expect(result.rows[0].result).toEqual([{ user_id: userId, display_name: `Google 會員 ${userId}` }]);
  await expect(db.query('select public.admin_push_log_member_names($1::uuid[])', [Array(201).fill(userId)])).rejects.toThrow('INVALID_MEMBER_IDS');
  const grants = await db.query<{ role: string; allowed: boolean }>(`select role, has_function_privilege(role, 'public.admin_push_log_member_names(uuid[])', 'execute') allowed from (values ('anon'), ('authenticated'), ('service_role')) roles(role)`);
  expect(grants.rows).toEqual([{ role: 'anon', allowed: false }, { role: 'authenticated', allowed: false }, { role: 'service_role', allowed: true }]);
});
it('preserves LINE and Google identity fallbacks for log recipients without names', async () => {
  await db.exec(`update members set line_display_name=null, line_user_id='line-only' where auth_user_id=md5('1204')::uuid;
    update auth.users set raw_user_meta_data='{}' where id in (md5('1204')::uuid, md5('1205')::uuid);
    update auth.identities set identity_data='{}' where user_id=md5('1205')::uuid;`);
  const result = await db.query<{ result: { display_name: string }[] }>("select public.admin_push_log_member_names(array[md5('1204')::uuid,md5('1205')::uuid]) as result");
  expect(result.rows[0].result.map(row => row.display_name).sort()).toEqual(['Google ID：google-late-recipient', 'LINE ID：line-only']);
});
