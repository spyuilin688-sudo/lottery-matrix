import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = new PGlite();
const migration = readFileSync(
  new URL('../../../supabase/migrations/20260925083132_preserve_activation_entitlement_on_delete.sql', import.meta.url),
  'utf8',
);

const superAdmin = '00000000-0000-4000-8000-000000000001';
const operator = '00000000-0000-4000-8000-000000000002';
const monthlyPlan = '00000000-0000-4000-8000-000000000010';
const member = '00000000-0000-4000-8000-000000000020';
const lifetimeMember = '00000000-0000-4000-8000-000000000021';
const usedCode = '00000000-0000-4000-8000-000000000030';
const lifetimeCode = '00000000-0000-4000-8000-000000000031';
const operatorUsedCode = '00000000-0000-4000-8000-000000000032';
const unusedCode = '00000000-0000-4000-8000-000000000033';

beforeAll(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;

    create table public.plans (
      id uuid primary key,
      name text not null
    );

    create table public.members (
      id uuid primary key,
      current_plan_id uuid references public.plans(id),
      plan_started_at timestamptz,
      plan_expires_at timestamptz,
      is_lifetime boolean not null default false,
      auto_renew boolean not null default true,
      subscription_revision bigint not null default 0
    );

    create table public.admin_accounts (
      id uuid primary key,
      role text not null,
      status text not null
    );

    create table public.activation_codes (
      id uuid primary key,
      code text not null unique,
      duration_type text not null,
      status text not null,
      redeemed_at timestamptz,
      redeemed_by_member_id uuid references public.members(id)
    );

    create table public.audit_logs (
      id uuid primary key default gen_random_uuid(),
      admin_id uuid references public.admin_accounts(id),
      admin text,
      operation_type text,
      target_table text,
      target_id text,
      content text,
      before_data jsonb
    );

    insert into public.plans values ('${monthlyPlan}', '月費方案');
    insert into public.admin_accounts values
      ('${superAdmin}', '超級管理員', '啟用'),
      ('${operator}', '營運管理員', '啟用');

    insert into public.members (
      id, current_plan_id, plan_started_at, plan_expires_at, is_lifetime, auto_renew, subscription_revision
    ) values
      ('${member}', '${monthlyPlan}', '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', false, true, 7),
      ('${lifetimeMember}', '${monthlyPlan}', '2026-08-01T00:00:00Z', null, true, false, 3);

    insert into public.activation_codes (
      id, code, duration_type, status, redeemed_at, redeemed_by_member_id
    ) values
      ('${usedCode}', 'USED-0001-0001-0001', '30_days', 'used', '2026-09-01T00:00:00Z', '${member}'),
      ('${lifetimeCode}', 'LIFE-0001-0001-0001', 'lifetime', 'used', '2026-08-01T00:00:00Z', '${lifetimeMember}'),
      ('${operatorUsedCode}', 'USED-0002-0002-0002', '30_days', 'used', '2026-09-02T00:00:00Z', '${member}'),
      ('${unusedCode}', 'FREE-0001-0001-0001', '7_days', 'unused', null, null);

    select pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', false);
  `);
  await db.exec(migration);
}, 20_000);

afterAll(() => db.close());

async function entitlement(memberId: string) {
  return (await db.query(
    `select current_plan_id, plan_started_at, plan_expires_at, is_lifetime, auto_renew, subscription_revision
     from public.members where id=$1`,
    [memberId],
  )).rows[0];
}

const remove = (codeId: string, actorId: string, actorName = '管理員') =>
  db.query('select public.admin_delete_activation_code($1,$2,$3) as result', [codeId, actorId, actorName]);

describe('activation-code deletion preserves member entitlement', () => {
  it('deletes a redeemed fixed-duration code without changing the member plan and hides super-admin audit', async () => {
    const before = await entitlement(member);
    await expect(remove(usedCode, superAdmin)).resolves.toMatchObject({
      rows: [{ result: { deleted: true } }],
    });
    expect(await entitlement(member)).toEqual(before);
    expect((await db.query('select count(*)::int as n from public.activation_codes where id=$1', [usedCode])).rows)
      .toEqual([{ n: 0 }]);
    expect((await db.query('select count(*)::int as n from public.audit_logs where target_id=$1', [usedCode])).rows)
      .toEqual([{ n: 0 }]);
  });

  it('deletes a redeemed lifetime code without changing lifetime entitlement and hides super-admin audit', async () => {
    const before = await entitlement(lifetimeMember);
    await expect(remove(lifetimeCode, superAdmin)).resolves.toMatchObject({
      rows: [{ result: { deleted: true } }],
    });
    expect(await entitlement(lifetimeMember)).toEqual(before);
    expect((await db.query('select count(*)::int as n from public.audit_logs where target_id=$1', [lifetimeCode])).rows)
      .toEqual([{ n: 0 }]);
  });

  it('still forbids an operations administrator from deleting a redeemed code', async () => {
    await expect(remove(operatorUsedCode, operator)).rejects.toMatchObject({
      code: '42501',
      message: 'REDEEMED_ACTIVATION_CODE_DELETE_FORBIDDEN',
    });
    expect((await db.query('select count(*)::int as n from public.activation_codes where id=$1', [operatorUsedCode])).rows)
      .toEqual([{ n: 1 }]);
  });

  it('still lets an operations administrator delete an unused code and records that audit', async () => {
    await expect(remove(unusedCode, operator, '營運管理員')).resolves.toMatchObject({
      rows: [{ result: { deleted: true } }],
    });
    expect((await db.query('select count(*)::int as n from public.audit_logs where target_id=$1', [unusedCode])).rows)
      .toEqual([{ n: 1 }]);
  });
});
