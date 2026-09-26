import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = new PGlite();
const owner = '00000000-0000-4000-8000-000000000001';
const otherSuper = '00000000-0000-4000-8000-000000000002';
const member = '00000000-0000-4000-8000-000000000003';
const monthlyPlan = '00000000-0000-4000-8000-000000000004';
const read = (file: string) => readFileSync(new URL(`../../../supabase/migrations/${file}`, import.meta.url), 'utf8');
const generate = (actor: string, duration: string, hidden: boolean, request = crypto.randomUUID()) =>
  db.query<{ result: { batchId: string; count: number } }>(
    'select public.admin_generate_activation_code_batch($1,$2,$3,$4,$5) as result',
    [duration, 1, actor, request, hidden],
  );

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema extensions; create schema private; create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.test_uid',true),'')::uuid $$;
    create function extensions.gen_random_bytes(integer) returns bytea language sql
      as $$ select decode(replace(gen_random_uuid()::text,'-',''),'hex') $$;
    create table public.admin_accounts (id uuid primary key, account text not null, name text, role text, status text, can_add boolean);
    create table public.plans (id uuid primary key, name text, duration_days integer);
    create table public.members (
      id uuid primary key, auth_user_id uuid, status text, current_plan_id uuid references public.plans(id),
      plan_started_at timestamptz, plan_expires_at timestamptz,
      is_lifetime boolean not null default false, auto_renew boolean not null default true,
      subscription_revision bigint not null default 0
    );
    create table public.activation_code_batches (
      id uuid primary key default gen_random_uuid(), duration_type text, quantity integer,
      created_at timestamptz, expires_at timestamptz
    );
    create table public.activation_codes (
      id uuid primary key default gen_random_uuid(), batch_id uuid references public.activation_code_batches(id),
      code text unique, duration_type text, created_at timestamptz, expires_at timestamptz,
      status text, redeemed_at timestamptz, redeemed_by_member_id uuid references public.members(id)
    );
    create table public.audit_logs (
      admin_id uuid, admin text, operation_type text, target_table text,
      target_id text, content text, after_data jsonb, before_data jsonb
    );
    insert into public.admin_accounts values
      ('${owner}','spyuilin688@gmail.com','Owner','超級管理員','啟用',true),
      ('${otherSuper}','other@example.com','Other','超級管理員','啟用',true);
    insert into public.plans values ('${monthlyPlan}','月費方案',30);
    insert into public.members(id,auth_user_id,status,current_plan_id)
      values ('${member}','${member}','active','${monthlyPlan}');
    select set_config('request.jwt.claims','{"role":"service_role"}',false);
    select set_config('app.test_uid','${member}',false);
  `);
  await db.exec(read('20260910123427_admin_atomic_activation_batch.sql'));
  await db.exec(read('20260926005023_private_activation_codes.sql'));
}, 20000);
afterAll(() => db.close());

describe('private activation code database lifecycle', () => {
  it('allows only the specified super administrator and scopes the retry identity', async () => {
    await expect(generate(otherSuper, 'lifetime', true)).rejects.toMatchObject({ code: '42501' });
    const request = crypto.randomUUID();
    const first = await generate(owner, 'lifetime', true, request);
    expect(await generate(owner, 'lifetime', true, request)).toEqual(first);
    await expect(generate(owner, 'lifetime', false, request)).rejects.toMatchObject({ message: 'ACTIVATION_REQUEST_CONFLICT' });
    expect((await db.query('select count(*)::int as n from public.audit_logs')).rows).toEqual([{ n: 0 }]);
    expect((await db.query('select is_private from public.activation_code_batches where id=$1', [first.rows[0].result.batchId])).rows)
      .toEqual([{ is_private: true }]);
    await expect(generate(owner, '7_days', false)).resolves.toMatchObject({ rows: [{ result: { count: 1 } }] });
    expect((await db.query('select count(*)::int as n from public.audit_logs')).rows).toEqual([{ n: 1 }]);
    await db.query('select public.admin_generate_activation_code_batch($1,$2,$3,$4)',
      ['7_days', 1, owner, crypto.randomUUID()]);
    expect((await db.query('select count(*)::int as n from public.audit_logs')).rows).toEqual([{ n: 2 }]);
    expect((await db.query("select has_table_privilege('authenticated','public.private_activation_redemptions','select') as allowed")).rows)
      .toEqual([{ allowed: false }]);
    expect((await db.query("select has_function_privilege('authenticated','public.admin_generate_activation_code_batch(text,integer,uuid,uuid,boolean)','execute') as allowed")).rows)
      .toEqual([{ allowed: false }]);
  });

  it('redeems a hidden lifetime code and preserves both the real plan and private source after deletion', async () => {
    const row = (await db.query<{ id: string; code: string }>(`
      select code.id, code.code from public.activation_codes as code
      join public.activation_code_batches as batch on batch.id=code.batch_id
      where batch.is_private=true
    `)).rows[0];
    const redeemed = await db.query<{ result: { is_lifetime: boolean } }>(
      'select private.redeem_activation_code($1) as result', [row.code],
    );
    expect(redeemed.rows[0].result.is_lifetime).toBe(true);
    await expect(db.query('select public.admin_delete_activation_code($1,$2,$3)', [row.id, otherSuper, 'Other']))
      .rejects.toMatchObject({ code: '42501', message: 'PRIVATE_ACTIVATION_CODE_FORBIDDEN' });
    await db.query('select public.admin_delete_activation_code($1,$2,$3)', [row.id, owner, 'Owner']);
    expect((await db.query('select count(*)::int as n from public.activation_codes where id=$1', [row.id])).rows).toEqual([{ n: 0 }]);
    expect((await db.query('select is_lifetime, plan_expires_at from public.members where id=$1', [member])).rows)
      .toEqual([{ is_lifetime: true, plan_expires_at: null }]);
    expect((await db.query('select code_id, is_lifetime from public.private_activation_redemptions where member_id=$1', [member])).rows)
      .toEqual([{ code_id: row.id, is_lifetime: true }]);
    expect((await db.query('select count(*)::int as n from public.audit_logs')).rows).toEqual([{ n: 2 }]);
  });
});
