import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = new URL('../supabase/migrations/20260923083441_ecpay_one_time_checkout.sql', import.meta.url);
const paymentGuardMigration = new URL('../supabase/migrations/20260923125012_guard_payment_plan_entitlements.sql', import.meta.url);
const manualTransferMigration = new URL('../supabase/migrations/20260830060000_manual_bank_transfer.sql', import.meta.url);
const latestManualReviewMigration = new URL('../supabase/migrations/20260905140908_repair_admin_backend_rpc_execution.sql', import.meta.url);
const reversalMigration = new URL('../supabase/migrations/20260908210936_record_payment_reversal.sql', import.meta.url);
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

async function setup() {
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
    create table public.admin_accounts (id uuid primary key);
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
    grant select on public.admin_accounts to service_role;
    grant insert on public.audit_logs to service_role;
    grant insert, select, update on public.payments to service_role;
    grant usage on schema auth to authenticated;
  `);
  await db.exec(await readFile(migration, 'utf8'));
  await loadExistingFunction(db, manualTransferMigration, 'member_transfer_request_submit');
  await loadExistingFunction(db, latestManualReviewMigration, 'admin_review_transfer_request');
  await loadExistingFunction(db, reversalMigration, 'admin_record_payment_reversal');
  await db.exec(await readFile(paymentGuardMigration, 'utf8'));
  return db;
}

async function service(db) { await db.exec('reset role; set role service_role'); }
async function owner(db) { await db.exec('reset role'); }

test('only the backend can create an order; price comes from the stored plan', async () => {
  const db = await setup();
  try {
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}'`);
    await assert.rejects(db.query(`select public.ecpay_order_create('${userId}', 'month', '${number}', '${merchant}')`), /permission denied/);
    await service(db);
    const { rows } = await db.query(`select public.ecpay_order_create('${userId}', 'month', '${number}', '${merchant}') as result`);
    assert.equal(rows[0].result.amount, 2880);
    assert.equal(rows[0].result.merchantTradeNo, number);
    await assert.rejects(db.query(`select public.ecpay_order_create('${userId}', 'month', '${number}', '${merchant}')`), /duplicate key/);
    await assert.rejects(db.query(`select public.ecpay_order_create('${userId}', 'lifetime', 'OTHER', '${merchant}')`), /INVALID_PLAN/);
  } finally { await db.close(); }
});

test('a real paid order extends membership exactly once and keeps auto renew off', async () => {
  const db = await setup();
  try {
    await service(db);
    await db.query('select public.ecpay_order_create($1,$2,$3,$4)', [userId, 'month', number, merchant]);
    for (let i = 0; i < 2; i++) {
      await db.query('select public.ecpay_payment_confirm($1,$2,$3,$4)', [number, merchant, '2609231234567890', 2880]);
    }
    const { rows: member } = await db.query('select plan_expires_at, current_plan_id, auto_renew from public.members where id=$1', [memberId]);
    assert.equal(new Date(member[0].plan_expires_at).toISOString(), '2099-01-31T00:00:00.000Z');
    assert.equal(member[0].current_plan_id, planId);
    assert.equal(member[0].auto_renew, false);
    const { rows: payments } = await db.query('select amount, status from public.payments');
    assert.deepEqual(payments, [{ amount: 2880, status: 'confirmed' }]);
    await assert.rejects(db.query('select public.ecpay_payment_confirm($1,$2,$3,$4)', [number, merchant, 'different', 2880]), /PAYMENT_CONFLICT/);
  } finally { await db.close(); }
});

test('mismatched amounts cannot grant a paid subscription; disabled members cannot create a new checkout', async () => {
  const db = await setup();
  try {
    await service(db);
    await db.query('select public.ecpay_order_create($1,$2,$3,$4)', [userId, 'month', number, merchant]);
    await assert.rejects(db.query('select public.ecpay_payment_confirm($1,$2,$3,$4)', [number, merchant, '2609231234567890', 1]), /ORDER_MISMATCH/);
    await owner(db);
    await db.query("update public.members set status='停用' where id=$1", [memberId]);
    await service(db);
    await assert.rejects(db.query('select public.ecpay_order_create($1,$2,$3,$4)', [userId, 'month', 'ANOTHERORDER', merchant]), /FORBIDDEN/);
    const { rows } = await db.query('select count(*)::integer as count from public.payments');
    assert.equal(rows[0].count, 0);
  } finally { await db.close(); }
});

test('turning off subscription purchase blocks new ECPay orders', async () => {
  const db = await setup();
  try {
    await db.exec('update private.purchase_settings set visible=false');
    await service(db);
    await assert.rejects(db.query('select public.ecpay_order_create($1,$2,$3,$4)', [userId, 'month', number, merchant]), /PURCHASE_DISABLED/);
    const { rows } = await db.query('select count(*)::integer as count from public.ecpay_orders');
    assert.equal(rows[0].count, 0);
  } finally { await db.close(); }
});

test('existing manual transfer and online payment both appear in the owning member history', async () => {
  const db = await setup();
  try {
    await service(db);
    await db.query('select public.ecpay_order_create($1,$2,$3,$4)', [userId, 'month', number, merchant]);
    await db.query('select public.ecpay_payment_confirm($1,$2,$3,$4)', [number, merchant, '2609231234567890', 2880]);
    await owner(db);
    await db.exec(`insert into public.transfer_requests (id,member_id,plan_id,amount,account_last_five,submitted_at,status) values
      ('30000000-0000-4000-8000-000000000001','${memberId}','${planId}',2880,'12345',now(),'confirmed');
      insert into public.payments(member_id,plan_id,transfer_request_id,amount,paid_at,status) values
      ('${memberId}','${planId}','30000000-0000-4000-8000-000000000001',2880,now(),'confirmed');`);
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}'`);
    const { rows } = await db.query('select public.member_payment_history_get() as history');
    assert.equal(rows[0].history.length, 2);
    assert.deepEqual(new Set(rows[0].history.map(item => item.accountLastFive ?? null)), new Set(['12345', null]));
    await owner(db);
    const { rows: grants } = await db.query(`select
      has_function_privilege('anon','public.ecpay_payment_confirm(text,text,text,integer)','execute') as anon,
      has_function_privilege('authenticated','public.ecpay_payment_confirm(text,text,text,integer)','execute') as member`);
    assert.deepEqual(grants[0], { anon: false, member: false });
  } finally { await db.close(); }
});

test('lifetime and active higher-tier members cannot create a lower paid order; matching and upgrading plans remain available', async () => {
  const db = await setup();
  try {
    await service(db);
    await db.query('update public.members set is_lifetime=true where id=$1', [memberId]);
    await assert.rejects(db.query('select public.ecpay_order_create($1,$2,$3,$4)', [userId, 'year', number, merchant]), /LIFETIME_PURCHASE_BLOCKED/);
    await owner(db);
    await db.query('update public.members set is_lifetime=false,current_plan_id=$1,plan_expires_at=now()+interval \'10 days\' where id=$2', [yearPlanId, memberId]);
    await service(db);
    await assert.rejects(db.query('select public.ecpay_order_create($1,$2,$3,$4)', [userId, 'month', number, merchant]), /PLAN_DOWNGRADE_BLOCKED/);
    await assert.rejects(db.query('select public.ecpay_order_create($1,$2,$3,$4)', [userId, 'quarter', number, merchant]), /PLAN_DOWNGRADE_BLOCKED/);
    await db.query('select public.ecpay_order_create($1,$2,$3,$4)', [userId, 'year', number, merchant]);
    await owner(db);
    await db.query('update public.members set current_plan_id=$1 where id=$2', [quarterPlanId, memberId]);
    await service(db);
    await db.query('select public.ecpay_order_create($1,$2,$3,$4)', [userId, 'year', 'ANOTHERORDER', merchant]);
  } finally { await db.close(); }
});

test('an expired higher-tier membership allows a new lower plan purchase', async () => {
  const db = await setup();
  try {
    await db.query("update public.members set current_plan_id=$1,plan_expires_at=now()-interval '1 minute'", [yearPlanId]);
    await service(db);
    const { rows } = await db.query('select public.ecpay_order_create($1,$2,$3,$4) as result', [userId, 'month', number, merchant]);
    assert.equal(rows[0].result.planName, '月費方案');
  } finally { await db.close(); }
});

test('paid monthly callback after upgrading to year records refund_required once, without a downgrade or added year time', async () => {
  const db = await setup();
  try {
    await service(db);
    await db.query('select public.ecpay_order_create($1,$2,$3,$4)', [userId, 'month', number, merchant]);
    await owner(db);
    await db.query("update public.members set current_plan_id=$1,plan_expires_at='2099-03-01T00:00:00Z' where id=$2", [yearPlanId, memberId]);
    await service(db);
    for (let i = 0; i < 2; i++) {
      const { rows } = await db.query('select public.ecpay_payment_confirm($1,$2,$3,$4) as result', [number, merchant, '2609231234567890', 2880]);
      assert.equal(rows[0].result.status, 'refund_required');
    }
    const { rows: [member] } = await db.query('select current_plan_id,plan_expires_at,is_lifetime from public.members where id=$1', [memberId]);
    assert.equal(member.current_plan_id, yearPlanId);
    assert.equal(new Date(member.plan_expires_at).toISOString(), '2099-03-01T00:00:00.000Z');
    assert.equal(member.is_lifetime, false);
    const { rows: [payment] } = await db.query('select amount,status from public.payments');
    assert.deepEqual(payment, { amount: 2880, status: 'refund_required' });
    const { rows: [order] } = await db.query('select status,trade_no,paid_at from public.ecpay_orders');
    assert.equal(order.status, 'refund_required');
    assert.equal(order.trade_no, '2609231234567890');
    assert.ok(order.paid_at);
    const { rows: [count] } = await db.query('select count(*)::integer as total from public.payments');
    assert.equal(count.total, 1);
    await assert.rejects(db.query('select public.ecpay_payment_confirm($1,$2,$3,$4)', [number, merchant, 'DIFFERENT', 2880]), /PAYMENT_CONFLICT/);
    await owner(db);
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}'`);
    const { rows: [history] } = await db.query('select public.member_payment_history_get() as rows');
    assert.equal(history.rows[0].status, 'refund_required');
  } finally { await db.close(); }
});

test('paid callback after lifetime grant preserves permanent membership and marks refund required', async () => {
  const db = await setup();
  try {
    await service(db);
    await db.query('select public.ecpay_order_create($1,$2,$3,$4)', [userId, 'month', number, merchant]);
    await owner(db);
    await db.query('update public.members set is_lifetime=true,current_plan_id=$1 where id=$2', [yearPlanId, memberId]);
    await service(db);
    const { rows } = await db.query('select public.ecpay_payment_confirm($1,$2,$3,$4) as result', [number, merchant, '2609231234567890', 2880]);
    assert.equal(rows[0].result.status, 'refund_required');
    const { rows: [member] } = await db.query('select is_lifetime,current_plan_id,plan_expires_at from public.members where id=$1', [memberId]);
    assert.equal(member.is_lifetime, true);
    assert.equal(member.current_plan_id, yearPlanId);
    assert.equal(new Date(member.plan_expires_at).toISOString(), '2099-01-01T00:00:00.000Z');
  } finally { await db.close(); }
});

test('manual transfer submit uses the same lifetime, downgrade and purchase-switch guards as online checkout', async () => {
  const db = await setup();
  try {
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}'`);
    await owner(db);
    await db.query('update public.members set is_lifetime=true where id=$1', [memberId]);
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}'`);
    await assert.rejects(db.query("select public.member_transfer_request_submit('month','12345')"), /LIFETIME_PURCHASE_BLOCKED/);
    await owner(db);
    await db.query("update public.members set is_lifetime=false,current_plan_id=$1,plan_expires_at=now()+interval '10 days' where id=$2", [yearPlanId, memberId]);
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}'`);
    await assert.rejects(db.query("select public.member_transfer_request_submit('quarter','12345')"), /PLAN_DOWNGRADE_BLOCKED/);
    await owner(db);
    await db.query('update private.purchase_settings set visible=false');
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}'`);
    await assert.rejects(db.query("select public.member_transfer_request_submit('year','12345')"), /PURCHASE_DISABLED/);
    await owner(db);
    await db.query('update private.purchase_settings set visible=true');
    await db.query("update public.members set status='停用' where id=$1", [memberId]);
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}'`);
    await assert.rejects(db.query("select public.member_transfer_request_submit('year','12345')"), /FORBIDDEN/);
    await owner(db);
    await db.query("update public.members set status='啟用' where id=$1", [memberId]);
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}'`);
    const { rows } = await db.query("select public.member_transfer_request_submit('year','12345') as result");
    assert.equal(rows[0].result.planName, '年費方案');
  } finally { await db.close(); }
});

test('manual transfer paid review after lifetime grant requires refund, keeps membership, and reversal marks refunded', async () => {
  const db = await setup();
  try {
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}'`);
    const { rows: [{ result: request }] } = await db.query("select public.member_transfer_request_submit('month','12345') as result");
    await owner(db);
    await db.query('update public.members set is_lifetime=true,current_plan_id=$1 where id=$2', [yearPlanId, memberId]);
    const actorId = '30000000-0000-4000-8000-000000000003';
    await db.query('insert into public.admin_accounts(id) values ($1)', [actorId]);
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}'`);
    await assert.rejects(db.query('select public.admin_review_transfer_request($1,$2,now(),$3,$4)', [request.id, 'confirmed', actorId, '客服']), /permission denied/);
    await service(db);
    await db.query('select public.admin_review_transfer_request($1,$2,now(),$3,$4)', [request.id, 'confirmed', actorId, '客服']);
    const { rows: [payment] } = await db.query('select id,status from public.payments');
    assert.equal(payment.status, 'refund_required');
    const { rows: [member] } = await db.query('select current_plan_id,is_lifetime,plan_expires_at from public.members where id=$1', [memberId]);
    assert.equal(member.current_plan_id, yearPlanId);
    assert.equal(member.is_lifetime, true);
    assert.equal(new Date(member.plan_expires_at).toISOString(), '2099-01-01T00:00:00.000Z');
    await db.query('select public.admin_record_payment_reversal($1,$2,$3,$4,$5)', [payment.id, 'refunded', '完成退款', actorId, '客服']);
    const { rows: [refunded] } = await db.query('select status,reversal_reason from public.payments where id=$1', [payment.id]);
    assert.deepEqual(refunded, { status: 'refunded', reversal_reason: '完成退款' });
    await owner(db);
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}'`);
    const { rows: [history] } = await db.query('select public.member_payment_history_get() as rows');
    assert.equal(history.rows[0].status, 'refunded');
  } finally { await db.close(); }
});

test('manual transfer paid review after upgrading to year keeps year and its expiry, while a valid same-tier review extends time', async () => {
  const db = await setup();
  try {
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}'`);
    const { rows: [{ result: request }] } = await db.query("select public.member_transfer_request_submit('month','12345') as result");
    await owner(db);
    const actorId = '30000000-0000-4000-8000-000000000003';
    await db.query('insert into public.admin_accounts(id) values ($1)', [actorId]);
    await db.query("update public.members set current_plan_id=$1,plan_expires_at='2099-03-01T00:00:00Z' where id=$2", [yearPlanId, memberId]);
    await service(db);
    await db.query('select public.admin_review_transfer_request($1,$2,now(),$3,$4)', [request.id, 'confirmed', actorId, '客服']);
    const { rows: [payment] } = await db.query('select status from public.payments');
    assert.equal(payment.status, 'refund_required');
    const { rows: [member] } = await db.query('select current_plan_id,plan_expires_at from public.members where id=$1', [memberId]);
    assert.equal(member.current_plan_id, yearPlanId);
    assert.equal(new Date(member.plan_expires_at).toISOString(), '2099-03-01T00:00:00.000Z');

    await owner(db);
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}'`);
    const { rows: [{ result: renewal }] } = await db.query("select public.member_transfer_request_submit('year','54321') as result");
    await service(db);
    await db.query('select public.admin_review_transfer_request($1,$2,now(),$3,$4)', [renewal.id, 'confirmed', actorId, '客服']);
    const { rows: [after] } = await db.query('select current_plan_id,plan_expires_at from public.members where id=$1', [memberId]);
    assert.equal(after.current_plan_id, yearPlanId);
    assert.equal(new Date(after.plan_expires_at).toISOString(), '2100-03-01T00:00:00.000Z');
    const { rows: statuses } = await db.query('select status from public.payments order by paid_at');
    assert.deepEqual(new Set(statuses.map(row => row.status)), new Set(['refund_required','confirmed']));
  } finally { await db.close(); }
});
