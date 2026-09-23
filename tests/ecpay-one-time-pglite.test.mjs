import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = new URL('../supabase/migrations/20260923080601_ecpay_one_time_checkout.sql', import.meta.url);
const userId = '00000000-0000-4000-8000-000000000001';
const memberId = '10000000-0000-4000-8000-000000000001';
const planId = '20000000-0000-4000-8000-000000000001';
const number = 'M2609231030001234567';
const merchant = '3002607';

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
      is_lifetime boolean not null default false, auto_renew boolean not null default false
    );
    create table public.transfer_requests (
      id uuid primary key, member_id uuid, plan_id uuid, amount integer,
      account_last_five text, submitted_at timestamptz, status text
    );
    create table public.payments (
      id uuid primary key default gen_random_uuid(), member_id uuid not null, plan_id uuid not null,
      transfer_request_id uuid, amount integer not null, paid_at timestamptz,
      status text not null default 'pending'
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
    insert into public.members (id, auth_user_id, status, plan_expires_at) values
      ('${memberId}', '${userId}', '啟用', '2099-01-01T00:00:00Z');
    grant usage on schema public to anon, authenticated, service_role;
    grant select, update on public.members to service_role;
    grant select on public.plans to service_role;
    grant insert, select, update on public.payments to service_role;
    grant usage on schema auth to authenticated;
  `);
  await db.exec(await readFile(migration, 'utf8'));
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
    await db.exec(`insert into public.transfer_requests values
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
