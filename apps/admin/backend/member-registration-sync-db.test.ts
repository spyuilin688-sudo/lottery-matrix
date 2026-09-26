import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260926143000_sync_registered_members_from_auth_identities.sql', import.meta.url),
  'utf8',
);

const existingGoogle = '11111111-1111-4111-8111-111111111111';
const existingLine = '22222222-2222-4222-8222-222222222222';
const existingEmail = '33333333-3333-4333-8333-333333333333';
const newGoogle = '44444444-4444-4444-8444-444444444444';
const newLine = '55555555-5555-4555-8555-555555555555';
const blocked = '66666666-6666-4666-8666-666666666666';

describe('registered member identity synchronization', () => {
  const db = new PGlite();

  beforeAll(async () => {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create schema private;

      create table auth.identities (
        id uuid primary key,
        user_id uuid not null,
        provider text not null,
        created_at timestamptz
      );

      create table public.members (
        auth_user_id uuid primary key,
        registered_at timestamptz not null default pg_catalog.now()
      );

      insert into auth.identities (id, user_id, provider, created_at) values
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '${existingGoogle}', 'google', '2026-09-01T00:00:00Z'),
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '${existingLine}', 'custom:line', '2026-09-02T00:00:00Z'),
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '${existingEmail}', 'email', '2026-09-03T00:00:00Z');
    `);

    await db.exec(migration);
  });

  afterAll(async () => {
    await db.close();
  });

  it('backfills existing Google and LINE identities but ignores unsupported providers', async () => {
    const result = await db.query<{ auth_user_id: string }>(
      'select auth_user_id::text from public.members order by auth_user_id',
    );

    expect(result.rows.map((row) => row.auth_user_id)).toEqual([existingGoogle, existingLine]);
  });

  it.each([
    ['google', newGoogle, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'],
    ['custom:line', newLine, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'],
  ])('creates a member in the same transaction for a new %s identity', async (provider, userId, identityId) => {
    await db.query(
      'insert into auth.identities (id, user_id, provider, created_at) values ($1, $2, $3, $4)',
      [identityId, userId, provider, '2026-09-26T14:30:00Z'],
    );

    const result = await db.query<{ count: string }>(
      'select count(*)::text as count from public.members where auth_user_id = $1',
      [userId],
    );
    expect(result.rows[0]?.count).toBe('1');
  });

  it('does not leave an Auth identity behind when the member insert cannot commit', async () => {
    await db.exec(`
      alter table public.members
      add constraint reject_blocked_member
      check (auth_user_id <> '${blocked}'::uuid);
    `);

    await expect(db.query(
      'insert into auth.identities (id, user_id, provider, created_at) values ($1, $2, $3, $4)',
      ['cccccccc-cccc-4ccc-8ccc-ccccccccccc1', blocked, 'google', '2026-09-26T14:31:00Z'],
    )).rejects.toThrow();

    const identity = await db.query<{ count: string }>(
      'select count(*)::text as count from auth.identities where user_id = $1',
      [blocked],
    );
    const member = await db.query<{ count: string }>(
      'select count(*)::text as count from public.members where auth_user_id = $1',
      [blocked],
    );

    expect(identity.rows[0]?.count).toBe('0');
    expect(member.rows[0]?.count).toBe('0');
  });
});
