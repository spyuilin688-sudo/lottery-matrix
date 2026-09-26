import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, test } from 'vitest';

const db = new PGlite();
const member = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const since = '2026-09-23T06:00:00Z';
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.member_online_sessions(member_id uuid, started_at timestamptz, online_seconds integer);
    grant select on public.member_online_sessions to service_role;`);
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20260926061852_admin_member_online_summary.sql', import.meta.url), 'utf8'));
  await db.query(`insert into public.member_online_sessions values
    ($1,$3,60), ($1,$3,31), ($1,$3,null), ($1,$3,-30),
    ($1,$3::timestamptz - interval '1 microsecond',999), ($2,$3,999)`, [member, other, since]);
}, 20_000);
afterAll(() => db.close());

test('preserves inclusive cutoff, per-session clamping, membership scope and final rounding', async () => {
  const result = await db.query<{ member_id: string; online_seconds: number }>(
    'select * from public.admin_member_online_summary($1,$2)', [[member, member], since]);
  expect(result.rows).toEqual([{ member_id: member, online_seconds: 91 }]);
  expect(Math.round(Number(result.rows[0].online_seconds) / 60)).toBe(2);
  expect((await db.query('select * from public.admin_member_online_summary($1,$2)', [[], since])).rows).toEqual([]);
});

test('aggregates more than a REST page of sessions without truncation', async () => {
  const many = '33333333-3333-4333-8333-333333333333';
  await db.query('insert into public.member_online_sessions select $1,$2,60 from generate_series(1,1105)', [many, since]);
  expect((await db.query('select * from public.admin_member_online_summary($1,$2)', [[many], since])).rows)
    .toEqual([{ member_id: many, online_seconds: 66300 }]);
});

test('is read-only and unavailable to public clients', async () => {
  const { rows } = await db.query(`select
    has_function_privilege('anon','public.admin_member_online_summary(uuid[],timestamptz)','execute') as anon,
    has_function_privilege('authenticated','public.admin_member_online_summary(uuid[],timestamptz)','execute') as authenticated,
    has_function_privilege('service_role','public.admin_member_online_summary(uuid[],timestamptz)','execute') as service,
    prosecdef, provolatile from pg_proc where oid='public.admin_member_online_summary(uuid[],timestamptz)'::regprocedure`);
  expect(rows).toEqual([{ anon: false, authenticated: false, service: true, prosecdef: false, provolatile: 's' }]);
  await db.exec('set role service_role');
  try {
    expect((await db.query('select * from public.admin_member_online_summary($1,$2)', [[member], since])).rows)
      .toEqual([{ member_id: member, online_seconds: 91 }]);
  } finally { await db.exec('reset role'); }
});
