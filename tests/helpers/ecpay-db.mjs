import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = new URL('../../supabase/migrations/20260923083441_ecpay_one_time_checkout.sql', import.meta.url);
const paymentGuardMigration = new URL('../../supabase/migrations/20260923125012_guard_payment_plan_entitlements.sql', import.meta.url);
const quotaBackoffMigration = new URL('../../supabase/migrations/20260924014322_serialize_ecpay_quota_backoff.sql', import.meta.url);
const transferSubmitMigration = new URL('../../supabase/migrations/20260924014336_idempotent_member_transfer_submit.sql', import.meta.url);
const manualTransferMigration = new URL('../../supabase/migrations/20260829223804_manual_bank_transfer.sql', import.meta.url);
const latestManualReviewMigration = new URL('../../supabase/migrations/20260905140908_repair_admin_backend_rpc_execution.sql', import.meta.url);
const reversalMigration = new URL('../../supabase/migrations/20260908210936_record_payment_reversal.sql', import.meta.url);
const entitlementReversalMigration = new URL('../../supabase/migrations/20260924020932_superadmin_reversal_entitlements.sql', import.meta.url);
const memberRevisionMigration = new URL('../../supabase/migrations/20260923125002_admin_mutation_guards.sql', import.meta.url);
const paymentGrantMigration = new URL('../../supabase/migrations/20260924030920_payment_entitlement_grant_evidence.sql', import.meta.url);
const userId = '00000000-0000-4000-8000-000000000001';
const memberId = '10000000-0000-4000-8000-000000000001';
const planId = '20000000-0000-4000-8000-000000000001';
const quarterPlanId = '20000000-0000-4000-8000-000000000002';
const yearPlanId = '20000000-0000-4000-8000-000000000003';
const number = 'M2609231030001234567';
const merchant = '3002607';

async function loadExistingFunction(db, sourcePath, name) {
  const source = await readFile(sourcePath, 'utf8');
  const definition = source.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`, 'i'))?.[0];
  assert.ok(definition, `expected historical function ${name}`);
  await db.exec(definition);
}

async function loadMemberSubscriptionRevision(db) {
  const source = await readFile(memberRevisionMigration, 'utf8');
  const start = source.indexOf('alter table public.members');
  const end = source.indexOf('create function public.admin_reset_revenue_baseline_v2(', start);
  assert.ok(start >= 0 && end > start, 'expected production subscription revision trigger');
  await db.exec(source.slice(start, end));
}

async function setup(quotaMigration) {
  const db = new PGlite();
  await db.exec(`
    create schema auth; create schema private;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table private.purchase_settings (visible boolean not null);
    insert into private.purchase_settings values (true);
    create function public.matrix_permission_settings() returns jsonb language sql stable security definer
    as $$ select jsonb_build_object('subscriptionPurchaseVisible', visible) from private.purchase_settings limit 1 $$;
    grant execute on function public.matrix_permission_settings() to service_role;
    create table public.plans (
      id uuid primary key, name text unique not null, price integer not null, duration_days integer not null
    );
    create table public.members (
      id uuid primary key, auth_user_id uuid not null unique, status text,
      current_plan_id uuid, plan_started_at timestamptz, plan_expires_at timestamptz,
      is_lifetime boolean not null default false, auto_renew boolean not null default false,
      invitation_code text
    );
    create table public.transfer_requests (
      id uuid primary key default gen_random_uuid(), member_id uuid, plan_id uuid, amount integer,
      account_last_five text, transferred_at timestamptz, submitted_at timestamptz, status text
    );
    create table public.payments (
      id uuid primary key default gen_random_uuid(), member_id uuid not null, plan_id uuid not null,
      transfer_request_id uuid, amount integer not null, paid_at timestamptz,
      status text not null default 'pending',
      reversed_at timestamptz, reversal_reason text, reversed_by uuid, reversed_by_name text,
      constraint payments_status_check check (status in ('pending', 'confirmed', 'rejected', 'refunded', 'chargeback', 'cancelled'))
    );
    create table public.admin_accounts (
      id uuid primary key, role text not null default '營運管理員', status text not null default '啟用'
    );
    create table public.audit_logs (
      admin_id uuid, admin text, operation_type text, target_table text,
      target_id text, content text, before_data jsonb, after_data jsonb
    );
    create function private.lock_active_member_id() returns uuid language plpgsql security definer
    set search_path = '' as $$
    declare result uuid;
    begin
      select id into result from public.members where auth_user_id = auth.uid()
        and coalesce(status, '') not in ('停用', 'disabled', 'inactive') for update;
      if result is null then raise exception 'FORBIDDEN'; end if;
      return result;
    end $$;
    insert into public.plans values ('${planId}', '月費方案', 2880, 30);
    insert into public.plans values ('${quarterPlanId}', '季費方案', 5580, 90);
    insert into public.plans values ('${yearPlanId}', '年費方案', 17800, 365);
    insert into public.members (id, auth_user_id, status, plan_expires_at) values
      ('${memberId}', '${userId}', '啟用', '2099-01-01T00:00:00Z');
    grant usage on schema public to anon, authenticated, service_role;
    grant select, update on public.members to service_role;
    grant select on public.plans to service_role;
    grant select, update on public.transfer_requests to service_role;
    grant select, update on public.admin_accounts to service_role;
    grant insert on public.audit_logs to service_role;
    grant insert, select, update on public.payments to service_role;
    grant usage on schema auth to authenticated;
  `);
  await loadMemberSubscriptionRevision(db);
  await db.exec(await readFile(migration, 'utf8'));
  await loadExistingFunction(db, manualTransferMigration, 'member_transfer_request_submit');
  await loadExistingFunction(db, latestManualReviewMigration, 'admin_review_transfer_request');
  await loadExistingFunction(db, reversalMigration, 'admin_record_payment_reversal');
  await db.exec(await readFile(paymentGuardMigration, 'utf8'));
  await db.exec(await readFile(transferSubmitMigration, 'utf8'));
  await db.exec(await readFile(entitlementReversalMigration, 'utf8'));
  await db.exec(await readFile(paymentGrantMigration, 'utf8'));
  if (quotaMigration) {
    await db.exec(await readFile(quotaMigration, 'utf8'));
    await db.exec(await readFile(quotaBackoffMigration, 'utf8'));
  }
  return db;
}

async function service(db) { await db.exec("reset role; set role service_role; set request.jwt.claim.role = 'service_role'"); }
async function owner(db) { await db.exec('reset role'); }


export { setup, service, owner, loadMemberSubscriptionRevision, paymentGrantMigration, userId, memberId, planId, quarterPlanId, yearPlanId, number, merchant };
