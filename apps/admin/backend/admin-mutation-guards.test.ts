import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../../supabase/migrations/20260923125002_admin_mutation_guards.sql', import.meta.url), 'utf8');
const adminA = '00000000-0000-4000-8000-000000000001';
const adminB = '00000000-0000-4000-8000-000000000002';
const member = '00000000-0000-4000-8000-000000000010';
const plan = '00000000-0000-4000-8000-000000000020';
const otherPlan = '00000000-0000-4000-8000-000000000021';
const db = new PGlite();

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private;
    create table public.admin_revenue_settings(id smallint primary key, reset_at timestamptz not null);
    create table public.plans(id uuid primary key, duration_days integer not null);
    create table public.members(
      id uuid primary key, current_plan_id uuid, plan_started_at timestamptz,
      plan_expires_at timestamptz, is_lifetime boolean not null default false,
      auto_renew boolean not null default false
    );
    create table public.audit_logs(
      admin_id uuid, admin text, operation_type text, target_table text,
      target_id text, content text, before_data jsonb, after_data jsonb
    );
    insert into public.plans values ('${plan}', 30), ('${otherPlan}', 90);
    insert into public.members(id,current_plan_id,plan_started_at,plan_expires_at)
    values ('${member}','${plan}','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z');
    select pg_catalog.set_config('request.jwt.claims','{"role":"service_role"}',false);
  `);
  await db.exec(migration);
}, 20_000);
afterAll(() => db.close());

const reset = (requestId: string, actorId = adminA) =>
  db.query<{ reset_at: string }>('select reset_at from public.admin_reset_revenue_baseline_v2($1,$2)', [requestId, actorId]);
const update = (action: string, options: { requestId?: string; revision?: number; actorId?: string; planId?: string; expiresAt?: string } = {}) =>
  db.query<{ result: { subscription_revision: number; plan_expires_at: string } }>(
    'select public.admin_update_subscription_guarded($1,$2,$3,$4,$5,$6,$7,$8,$9) as result',
    [member, action, options.planId ?? plan, options.expiresAt ?? null, '2026-09-23T00:00:00Z', options.actorId ?? adminA,
      '管理員', options.revision ?? null, options.requestId ?? null],
  );

describe('admin mutation guards in Postgres', () => {
  it('keeps one revenue baseline across a lost response and same-key retry, even after another reset', async () => {
    const requestId = '00000000-0000-4000-8000-000000000101';
    const first = await reset(requestId);
    await db.query('select pg_sleep(0.02)');
    await reset('00000000-0000-4000-8000-000000000102');
    const retry = await reset(requestId);
    expect(retry.rows[0].reset_at).toEqual(first.rows[0].reset_at);
    expect((await db.query<{ reset_at: string }>('select reset_at from public.admin_revenue_settings')).rows[0].reset_at)
      .not.toEqual(first.rows[0].reset_at);
    expect((await db.query('select count(*)::integer as count from private.admin_mutation_requests where operation = $1', ['revenue_reset'])).rows)
      .toEqual([{ count: 2 }]);
  });

  it('refuses to reuse the same reset request for a different administrator', async () => {
    const requestId = '00000000-0000-4000-8000-000000000103';
    await reset(requestId);
    await expect(reset(requestId, adminB)).rejects.toMatchObject({ code: 'PT409', message: 'ADMIN_REQUEST_CONFLICT' });
  });

  it('does not advance the baseline if saving the retry identity fails', async () => {
    const requestId = '00000000-0000-4000-8000-000000000107';
    const before = await db.query('select reset_at from public.admin_revenue_settings');
    await db.exec(`alter table private.admin_mutation_requests add constraint refuse_reset_request
      check (request_id <> '${requestId}'::uuid) not valid`);
    try {
      await expect(reset(requestId)).rejects.toThrow('refuse_reset_request');
      expect((await db.query('select reset_at from public.admin_revenue_settings')).rows).toEqual(before.rows);
    } finally {
      await db.exec('alter table private.admin_mutation_requests drop constraint refuse_reset_request');
    }
    await expect(reset(requestId)).resolves.toHaveProperty('rows');
  });

  it('rejects the second of two administrators editing the same subscription revision', async () => {
    const before = await db.query<{ subscription_revision: number }>('select subscription_revision from public.members where id=$1', [member]);
    const revision = before.rows[0].subscription_revision;
    await update('adjustExpiry', { actorId: adminA, revision, expiresAt: '2026-10-20T00:00:00Z' });
    await expect(update('adjustExpiry', { actorId: adminB, revision, expiresAt: '2026-10-25T00:00:00Z' }))
      .rejects.toMatchObject({ code: 'PT409', message: 'SUBSCRIPTION_CONFLICT' });
    const current = await db.query<{ plan_expires_at: string; subscription_revision: number }>('select plan_expires_at, subscription_revision from public.members where id=$1', [member]);
    expect(new Date(current.rows[0].plan_expires_at).toISOString()).toBe('2026-10-20T00:00:00.000Z');
    expect(current.rows[0].subscription_revision).toBe(revision + 1);
    expect((await db.query('select count(*)::integer as count from public.audit_logs where content=$1', ['訂閱操作：adjustExpiry'])).rows)
      .toEqual([{ count: 1 }]);
  });

  it('notices an intervening subscription update outside the admin RPC', async () => {
    const { rows: [before] } = await db.query<{ subscription_revision: number }>('select subscription_revision from public.members where id=$1', [member]);
    await db.query('update public.members set is_lifetime=true, plan_expires_at=null where id=$1', [member]);
    await expect(update('adjustExpiry', { revision: before.subscription_revision, expiresAt: '2026-10-25T00:00:00Z' }))
      .rejects.toMatchObject({ code: 'PT409', message: 'SUBSCRIPTION_CONFLICT' });
    expect((await db.query('select is_lifetime from public.members where id=$1', [member])).rows).toEqual([{ is_lifetime: true }]);
    await db.query('update public.members set is_lifetime=false, plan_expires_at=$2 where id=$1', [member, '2026-10-20T00:00:00Z']);
  });

  it('renews only once for the same request and rejects reuse with a different plan', async () => {
    const requestId = '00000000-0000-4000-8000-000000000104';
    const first = await update('renew', { requestId });
    const retry = await update('renew', { requestId });
    expect(retry.rows).toEqual(first.rows);
    expect((await db.query('select count(*)::integer as count from public.audit_logs where content=$1', ['訂閱操作：renew'])).rows)
      .toEqual([{ count: 1 }]);
    expect(new Date((await db.query<{ plan_expires_at: string }>('select plan_expires_at from public.members where id=$1', [member])).rows[0].plan_expires_at).toISOString())
      .toBe(new Date(first.rows[0].result.plan_expires_at).toISOString());
    await expect(update('renew', { requestId, planId: otherPlan })).rejects.toMatchObject({ code: 'PT409', message: 'ADMIN_REQUEST_CONFLICT' });
  });

  it('requires a request key for renew and an expected revision for expiry edits', async () => {
    await expect(update('renew')).rejects.toMatchObject({ code: '22023', message: 'ADMIN_REQUEST_REQUIRED' });
    await expect(update('adjustExpiry', { expiresAt: '2026-11-20T00:00:00Z' }))
      .rejects.toMatchObject({ code: '22023', message: 'SUBSCRIPTION_REVISION_REQUIRED' });
  });

  it('rolls back a renewal and its retry key together when its audit write fails', async () => {
    const requestId = '00000000-0000-4000-8000-000000000105';
    const before = await db.query<{ plan_expires_at: string }>('select plan_expires_at from public.members where id=$1', [member]);
    await db.exec("alter table public.audit_logs add constraint refuse_renew_audit check (content <> '訂閱操作：renew') not valid");
    try {
      await expect(update('renew', { requestId })).rejects.toThrow('refuse_renew_audit');
      expect((await db.query<{ plan_expires_at: string }>('select plan_expires_at from public.members where id=$1', [member])).rows)
        .toEqual(before.rows);
      expect((await db.query('select count(*)::integer as count from private.admin_mutation_requests where request_id=$1', [requestId])).rows)
        .toEqual([{ count: 0 }]);
    } finally {
      await db.exec('alter table public.audit_logs drop constraint refuse_renew_audit');
    }
    await expect(update('renew', { requestId })).resolves.toHaveProperty('rows');
  });

  it('never exposes the admin mutation RPCs to anonymous or member roles', async () => {
    expect((await db.query(`select has_function_privilege('anon','public.admin_reset_revenue_baseline_v2(uuid,uuid)','execute') as allowed`)).rows)
      .toEqual([{ allowed: false }]);
    expect((await db.query(`select has_function_privilege('authenticated','public.admin_update_subscription_guarded(uuid,text,uuid,timestamptz,timestamptz,uuid,text,bigint,uuid)','execute') as allowed`)).rows)
      .toEqual([{ allowed: false }]);
    expect((await db.query(`select has_table_privilege('anon','private.admin_mutation_requests','select') as allowed`)).rows)
      .toEqual([{ allowed: false }]);
    expect((await db.query(`select has_table_privilege('authenticated','private.admin_mutation_requests','insert') as allowed`)).rows)
      .toEqual([{ allowed: false }]);
    expect((await db.query(`select relrowsecurity as enabled from pg_catalog.pg_class where oid='private.admin_mutation_requests'::regclass`)).rows)
      .toEqual([{ enabled: true }]);
    await db.exec(`select pg_catalog.set_config('request.jwt.claims','{"role":"authenticated"}',false)`);
    try {
      await expect(reset('00000000-0000-4000-8000-000000000106'))
        .rejects.toMatchObject({ code: '42501', message: 'ADMIN_BACKEND_REQUIRED' });
    } finally {
      await db.exec(`select pg_catalog.set_config('request.jwt.claims','{"role":"service_role"}',false)`);
    }
  });
});
