import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';

const db = new PGlite();
const migration = new URL('../../../supabase/migrations/20260924224701_admin_push_member_details.sql', import.meta.url);
const one = '11111111-1111-4111-8111-111111111111';
const two = '22222222-2222-4222-8222-222222222222';

beforeAll(async () => {
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
    create table auth.identities (id uuid primary key, user_id uuid, provider text, provider_id text, identity_data jsonb, created_at timestamptz);
    create table public.member_push_subscriptions (id uuid primary key, user_id uuid, enabled boolean);
    insert into auth.users values ('${one}', '{"picture":"https://example.com/avatar.png","name":"User One"}'), ('${two}', '{}');
    insert into auth.identities values
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${one}', 'custom:line', 'line-one', '{"picture":"https://example.com/line.png"}', now()),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '${two}', 'google', 'google-two', '{"name":"Google Two","sub":"sub-two"}', now());
    insert into public.member_push_subscriptions values
      ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '${one}', true),
      ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '${two}', false);
  `);
  await db.exec(readFileSync(migration, 'utf8'));
}, 30000);
afterAll(async () => { await db.close(); });

it('returns only the selected identities, avatar and active push flag without private auth metadata', async () => {
  const result = await db.query<{ details: Array<Record<string, unknown>> }>(
    'select public.admin_push_member_details($1::uuid[]) as details', [[one, two]],
  );
  expect(result.rows[0].details).toEqual([
    {
      id: one, push_enabled: true,
      user_metadata: { name: 'User One', full_name: null, picture: 'https://example.com/avatar.png' },
      identities: [{ provider: 'custom:line', provider_id: 'line-one', identity_data: { name: null, full_name: null, sub: null, picture: 'https://example.com/line.png' } }],
    },
    {
      id: two, push_enabled: false,
      user_metadata: { name: null, full_name: null, picture: null },
      identities: [{ provider: 'google', provider_id: 'google-two', identity_data: { name: 'Google Two', full_name: null, sub: 'sub-two', picture: null } }],
    },
  ]);
});

it('rejects an unbounded batch and grants execution only to the backend role', async () => {
  await expect(db.query('select public.admin_push_member_details($1::uuid[])', [Array(31).fill(one)]))
    .rejects.toThrow('INVALID_MEMBER_IDS');
  const grants = await db.query<{ role: string; allowed: boolean }>(`select role, has_function_privilege(role, 'public.admin_push_member_details(uuid[])', 'execute') allowed from (values ('anon'), ('authenticated'), ('service_role')) roles(role)`);
  expect(grants.rows).toEqual([{ role: 'anon', allowed: false }, { role: 'authenticated', allowed: false }, { role: 'service_role', allowed: true }]);
});
