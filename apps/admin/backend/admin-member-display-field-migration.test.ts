import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';

const db = new PGlite();
const migration = new URL('../../../supabase/migrations/20260924225714_admin_member_display_field.sql', import.meta.url);
const line = '11111111-1111-4111-8111-111111111111';
const google = '22222222-2222-4222-8222-222222222222';

beforeAll(async () => {
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
    create table public.members (id uuid primary key, auth_user_id uuid, line_display_name text);
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
    create table auth.identities (id uuid primary key, user_id uuid, provider text, identity_data jsonb, created_at timestamptz);
    insert into public.members values ('${line}', '${line}', 'LINE 會員'), ('${google}', '${google}', null);
    insert into auth.users values ('${line}', '{"name":"隱藏姓名"}'), ('${google}', '{"full_name":"Google 會員"}');
    insert into auth.identities values
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${google}', 'google', '{"name":"備用名稱"}', now());
  `);
  await db.exec(readFileSync(migration, 'utf8'));
}, 30000);
afterAll(async () => { await db.close(); });

it('matches the displayed name fallback before paging without transferring every matching ID', async () => {
  const result = await db.query<{ id: string }>(`select m.id from public.members m
    where public.admin_member_display_name(m) ilike '%Google%'
    order by m.id limit 1 offset 0`);
  expect(result.rows).toEqual([{ id: google }]);
  const lineName = await db.query<{ name: string }>(
    `select public.admin_member_display_name(m) name from public.members m where id = '${line}'`,
  );
  expect(lineName.rows[0].name).toBe('LINE 會員');
  await db.exec(`update auth.users set raw_user_meta_data='{}' where id = '${google}'`);
  const fallback = await db.query<{ name: string }>(
    `select public.admin_member_display_name(m) name from public.members m where id = '${google}'`,
  );
  expect(fallback.rows[0].name).toBe('備用名稱');
});

it('only grants the computed name field to the backend role', async () => {
  const grants = await db.query<{ role: string; allowed: boolean }>(`select role,
    has_function_privilege(role, 'public.admin_member_display_name(public.members)', 'execute') allowed
    from (values ('anon'), ('authenticated'), ('service_role')) roles(role)`);
  expect(grants.rows).toEqual([{ role: 'anon', allowed: false }, { role: 'authenticated', allowed: false }, { role: 'service_role', allowed: true }]);
});
