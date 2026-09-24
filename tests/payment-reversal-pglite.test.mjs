import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { loadMemberSubscriptionRevision, paymentGrantMigration } from './helpers/ecpay-db.mjs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260908210936_record_payment_reversal.sql', import.meta.url),
  'utf8',
);
const entitlementReversalMigration = readFileSync(
  new URL('../supabase/migrations/20260924020932_superadmin_reversal_entitlements.sql', import.meta.url),
  'utf8',
);
const ecpayMigration = readFileSync(new URL('../supabase/migrations/20260923083441_ecpay_one_time_checkout.sql', import.meta.url), 'utf8');
const paymentGuardMigration = readFileSync(new URL('../supabase/migrations/20260923125012_guard_payment_plan_entitlements.sql', import.meta.url), 'utf8');
const grantEvidenceMigration = readFileSync(paymentGrantMigration, 'utf8');

const referralMigration = readFileSync(
  new URL('../supabase/migrations/20260904183827_allow_referral_code_after_payment.sql', import.meta.url),
  'utf8',
);
const entitlementMigration = readFileSync(
  new URL('../supabase/migrations/20260908035518_line_registration_algorithm_trials.sql', import.meta.url),
  'utf8',
);

function statementBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.notEqual(from, -1, `missing SQL start: ${start}`);
  assert.notEqual(to, -1, `missing SQL end: ${end}`);
  return source.slice(from, to);
}

const memberReferralSummarySql = statementBetween(
  referralMigration,
  'create or replace function public.member_referral_summary()',
  'create or replace function public.member_referral_submit',
);
const matrixEntitlementsSql = statementBetween(
  entitlementMigration,
  'CREATE OR REPLACE FUNCTION private.matrix_result_entitlements()',
  'create or replace function public.matrix_tianyan_list',
);

const IDS = {
  plan: '10000000-0000-4000-8000-000000000001',
  trialPlan: '10000000-0000-4000-8000-000000000002',
  actor: '20000000-0000-4000-8000-000000000001',
  superActor: '20000000-0000-4000-8000-000000000002',
  referrer: '30000000-0000-4000-8000-000000000001',
  referrerAuth: '40000000-0000-4000-8000-000000000001',
};

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create schema private;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;

    create function auth.uid() returns uuid language sql stable set search_path = ''
    as $$ select nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid $$;

    create table public.plans (
      id uuid primary key,
      name text not null,
      price integer not null,
      duration_days integer not null
    );
    create table public.admin_accounts (
      id uuid primary key,
      account text not null,
      name text not null,
      role text not null,
      status text not null default '啟用'
    );
    create table public.members (
      id uuid primary key,
      auth_user_id uuid,
      line_user_id text,
      status text default 'active',
      current_plan_id uuid references public.plans(id),
      plan_started_at timestamptz,
      plan_expires_at timestamptz,
      is_lifetime boolean not null default false,
      auto_renew boolean not null default true,
      referral_code text,
      invitation_code text,
      line_trial_started_at timestamptz
    );
    create table public.transfer_requests (
      id uuid primary key,
      member_id uuid not null references public.members(id),
      plan_id uuid not null references public.plans(id),
      amount integer not null,
      account_last_five text not null,
      transferred_at timestamptz,
      submitted_at timestamptz not null default now(),
      status text not null default 'pending'
    );
    create table public.payments (
      id uuid primary key,
      member_id uuid not null references public.members(id),
      plan_id uuid not null references public.plans(id),
      transfer_request_id uuid references public.transfer_requests(id),
      amount integer not null check (amount > 0),
      paid_at timestamptz,
      status text not null default 'pending',
      constraint payments_status_check check (status in ('pending', 'confirmed', 'rejected'))
    );
    create table public.audit_logs (
      id bigint generated always as identity primary key,
      admin_id uuid not null references public.admin_accounts(id),
      admin text not null,
      operation_type text not null,
      target_table text not null,
      target_id text,
      content text,
      before_data jsonb,
      after_data jsonb
    );

    create function public.skip_super_admin_audit_log() returns trigger
    language plpgsql security definer set search_path = '' as $$
    begin
      if exists (
        select 1 from public.admin_accounts
        where id = new.admin_id and role = '超級管理員'
      ) then
        return null;
      end if;
      return new;
    end;
    $$;
    create trigger skip_super_admin_audit_logs
      before insert on public.audit_logs
      for each row execute function public.skip_super_admin_audit_log();

    create function private.active_member_id() returns uuid
    language sql stable security definer set search_path = '' as $$
      select member.id from public.members as member
      where member.auth_user_id = auth.uid() limit 1
    $$;
    create function private.ensure_member_referral_code(p_member_id uuid) returns text
    language sql volatile security definer set search_path = '' as $$
      select member.referral_code from public.members as member where member.id = p_member_id
    $$;
  `);
  await db.exec(memberReferralSummarySql);
  await db.exec(matrixEntitlementsSql);
  await db.exec(migration);
  await db.exec(ecpayMigration);
  await db.exec(paymentGuardMigration);
  await loadMemberSubscriptionRevision(db);
  await db.exec(`
    select pg_catalog.set_config('request.jwt.claim.role', 'service_role', false);
  `);
  await db.exec(entitlementReversalMigration);
  await db.exec(grantEvidenceMigration);
  await db.exec(`
    insert into public.plans (id, name, price, duration_days) values
      ('${IDS.plan}', '月費方案', 2880, 30),
      ('${IDS.trialPlan}', '試用方案', 0, 7);
    insert into public.admin_accounts (id, account, name, role) values
      ('${IDS.actor}', 'operator', '營運管理員', '營運管理員'),
      ('${IDS.superActor}', 'root', '超級管理員', '超級管理員');
    insert into public.members (
      id, auth_user_id, line_user_id, status, plan_started_at, plan_expires_at,
      is_lifetime, auto_renew, referral_code
    ) values (
      '${IDS.referrer}', '${IDS.referrerAuth}', 'line-referrer', 'active',
      '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', false, true, 'REF-CODE'
    );
    insert into public.members (id, auth_user_id, line_user_id, invitation_code)
    select
      ('30000000-0000-4000-8000-' || pg_catalog.lpad(n::text, 12, '0'))::uuid,
      ('40000000-0000-4000-8000-' || pg_catalog.lpad(n::text, 12, '0'))::uuid,
      null,
      'REF-CODE'
    from pg_catalog.generate_series(2, 51) as generated(n);
    insert into public.payments (id, member_id, plan_id, amount, paid_at, status, entitlement_granted_at, entitlement_revision)
    select
      ('50000000-0000-4000-8000-' || pg_catalog.lpad(n::text, 12, '0'))::uuid,
      ('30000000-0000-4000-8000-' || pg_catalog.lpad((n + 1)::text, 12, '0'))::uuid,
      '${IDS.plan}',
      2880,
      '2026-02-01T00:00:00Z',
      'confirmed', '2026-02-01T00:00:00Z', 1
    from pg_catalog.generate_series(1, 50) as generated(n);
    insert into public.payments (id, member_id, plan_id, amount, paid_at, status, entitlement_granted_at, entitlement_revision)
    values (
      '50000000-0000-4000-8000-000000000051',
      '30000000-0000-4000-8000-000000000002',
      '${IDS.plan}', 2880, '2026-02-02T00:00:00Z', 'confirmed', '2026-02-02T00:00:00Z', 2
    );
    update public.members as member
    set current_plan_id = '${IDS.plan}',
        plan_started_at = '2026-02-01T00:00:00Z',
        plan_expires_at = '2026-03-03T00:00:00Z',
        auto_renew = false
    where member.id in (select payment.member_id from public.payments as payment where payment.status = 'confirmed');
    update public.members set plan_expires_at='2026-04-02T00:00:00Z'
    where id='30000000-0000-4000-8000-000000000002';
    select pg_catalog.set_config('request.jwt.claim.sub', '${IDS.referrerAuth}', false);
  `);
  return db;
}

async function scalar(db, sql, params = []) {
  const result = await db.query(sql, params);
  return Object.values(result.rows[0])[0];
}

async function reverse(db, number, status = 'refunded', actor = IDS.superActor, reason = `已完成沖銷 ${number}`) {
  const paymentId = `50000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
  const result = await db.query(
    `select public.admin_record_payment_reversal($1::uuid, $2::text, $3::text, $4::uuid, $5::text) as value`,
    [paymentId, status, reason, actor, actor === IDS.superActor ? '超級管理員' : '營運管理員'],
  );
  return result.rows[0].value;
}

async function setupTwoPurchases() {
  const db = await setup();
  await db.exec(`
    insert into public.plans(id, name, price, duration_days) values
      ('10000000-0000-4000-8000-000000000003', '年費方案', 17800, 365);
    insert into public.members(id, auth_user_id, is_lifetime, auto_renew) values (
      '30000000-0000-4000-8000-000000000999',
      '40000000-0000-4000-8000-000000000999',
      false, false
    );
    update public.members set current_plan_id='${IDS.plan}',
      plan_started_at='2026-09-23T14:08:07Z', plan_expires_at='2026-10-23T14:08:07Z'
      where id='30000000-0000-4000-8000-000000000999';
    update public.members set current_plan_id='10000000-0000-4000-8000-000000000003',
      plan_expires_at='2027-10-23T14:08:07Z'
      where id='30000000-0000-4000-8000-000000000999';
    insert into public.payments(id, member_id, plan_id, amount, paid_at, status, entitlement_granted_at, entitlement_revision) values
      ('50000000-0000-4000-8000-000000000901', '30000000-0000-4000-8000-000000000999',
       '${IDS.plan}', 2880, '2026-09-23T14:08:07Z', 'confirmed', '2026-09-23T14:08:07Z', 1),
      ('50000000-0000-4000-8000-000000000902', '30000000-0000-4000-8000-000000000999',
       '10000000-0000-4000-8000-000000000003', 17800, '2026-09-23T18:19:24Z', 'confirmed', '2026-09-23T18:19:24Z', 2);
  `);
  return db;
}

async function subscriptionOf(db, memberId = '30000000-0000-4000-8000-000000000999') {
  const { rows: [member] } = await db.query(
    'select current_plan_id, plan_started_at, plan_expires_at, is_lifetime, auto_renew from public.members where id = $1',
    [memberId],
  );
  return {
    ...member,
    plan_started_at: member.plan_started_at?.toISOString() ?? null,
    plan_expires_at: member.plan_expires_at?.toISOString() ?? null,
  };
}

test('reversing the annual purchase retains the earlier month and its original expiry', async () => {
  const db = await setupTwoPurchases();
  try {
    await reverse(db, 902, 'refunded', IDS.superActor);
    assert.deepEqual(await subscriptionOf(db), {
      current_plan_id: IDS.plan,
      plan_started_at: '2026-09-23T14:08:07.000Z',
      plan_expires_at: '2026-10-23T14:08:07.000Z',
      is_lifetime: false,
      auto_renew: false,
    });
    await reverse(db, 902, 'refunded', IDS.superActor, '同筆重試');
    assert.equal((await subscriptionOf(db)).plan_expires_at, '2026-10-23T14:08:07.000Z');
  } finally {
    await db.close();
  }
});

test('reversing the earlier month preserves the annual plan but removes those 30 days', async () => {
  const db = await setupTwoPurchases();
  try {
    await reverse(db, 901, 'chargeback', IDS.superActor);
    assert.deepEqual(await subscriptionOf(db), {
      current_plan_id: '10000000-0000-4000-8000-000000000003',
      plan_started_at: '2026-09-23T18:19:24.000Z',
      plan_expires_at: '2027-09-23T18:19:24.000Z',
      is_lifetime: false,
      auto_renew: false,
    });
  } finally {
    await db.close();
  }
});

test('reversing the last effective purchase removes the paid plan without changing the member status', async () => {
  const db = await setupTwoPurchases();
  try {
    await reverse(db, 902, 'cancelled', IDS.superActor);
    await reverse(db, 901, 'refunded', IDS.superActor);
    const member = await subscriptionOf(db);
    assert.equal(member.current_plan_id, null);
    assert.equal(member.plan_started_at, null);
    assert.equal(member.plan_expires_at, null);
    assert.equal(await scalar(db, `select status from public.members where id = '30000000-0000-4000-8000-000000000999'`), 'active');
  } finally {
    await db.close();
  }
});

test('a manual expiry adjustment blocks the entire payment reversal instead of erasing that grant', async () => {
  const db = await setupTwoPurchases();
  try {
    await db.exec(`update public.members set plan_expires_at = '2027-11-01T14:08:07Z'
      where id = '30000000-0000-4000-8000-000000000999'`);
    const before = await subscriptionOf(db);
    await assert.rejects(() => reverse(db, 902, 'refunded', IDS.superActor), /PAYMENT_ENTITLEMENT_CONFLICT/);
    assert.deepEqual(await subscriptionOf(db), before);
    assert.equal(await scalar(db, `select status from public.payments where id = '50000000-0000-4000-8000-000000000902'`), 'confirmed');
  } finally {
    await db.close();
  }
});

test('an operations administrator cannot reverse a payment even when able to edit subscriptions', async () => {
  const db = await setupTwoPurchases();
  try {
    await assert.rejects(() => reverse(db, 902, 'refunded', IDS.actor), /PAYMENT_REVERSAL_FORBIDDEN/);
    assert.equal(await scalar(db, `select status from public.payments where id = '50000000-0000-4000-8000-000000000902'`), 'confirmed');
  } finally {
    await db.close();
  }
});

test('a disabled super administrator cannot reverse a payment', async () => {
  const db = await setupTwoPurchases();
  try {
    await db.exec(`update public.admin_accounts set status = '停用' where id = '${IDS.superActor}'`);
    await assert.rejects(() => reverse(db, 902, 'refunded', IDS.superActor), /PAYMENT_REVERSAL_FORBIDDEN/);
    assert.equal(await scalar(db, `select status from public.payments where id = '50000000-0000-4000-8000-000000000902'`), 'confirmed');
  } finally {
    await db.close();
  }
});

test('a payment that never opened a plan can be reversed without changing another entitlement', async () => {
  const db = await setupTwoPurchases();
  try {
    await db.exec(`insert into public.payments(id, member_id, plan_id, amount, paid_at, status)
      values ('50000000-0000-4000-8000-000000000903',
        '30000000-0000-4000-8000-000000000999', '${IDS.plan}', 2880,
        '2026-09-24T00:00:00Z', 'refund_required')`);
    const before = await subscriptionOf(db);
    await reverse(db, 903, 'refunded', IDS.superActor);
    assert.deepEqual(await subscriptionOf(db), before);
    assert.equal(await scalar(db, `select status from public.payments where id = '50000000-0000-4000-8000-000000000903'`), 'refunded');
  } finally {
    await db.close();
  }
});

async function useMatchedLegacyEcpayGrants(db) {
  await db.exec(`
    insert into public.ecpay_orders(id,member_id,plan_id,merchant_id,merchant_trade_no,trade_no,amount,status,paid_at)
    select id,member_id,plan_id,'3002607','LEGACY'||right(id::text,3),'PROVIDER'||right(id::text,3),amount,'confirmed',paid_at
    from public.payments where member_id='30000000-0000-4000-8000-000000000999';
    update public.payments set ecpay_order_id=id,entitlement_granted_at=null,entitlement_revision=null
    where member_id='30000000-0000-4000-8000-000000000999';
  `);
}

test('legacy ECPay grants remain reversible only with exactly matching original orders', async () => {
  const db = await setupTwoPurchases();
  try {
    await useMatchedLegacyEcpayGrants(db);
    const before = await subscriptionOf(db);
    for (const mismatch of [
      "amount=1",
      `member_id='${IDS.referrer}'`,
      `plan_id='${IDS.plan}'`,
      "paid_at='2026-09-23T18:19:25Z'",
      "status='refund_required'",
    ]) {
      await db.exec(`update public.ecpay_orders set ${mismatch}
        where id='50000000-0000-4000-8000-000000000902'`);
      await assert.rejects(() => reverse(db, 902), /PAYMENT_ENTITLEMENT_CONFLICT/);
      assert.deepEqual(await subscriptionOf(db), before);
      assert.equal(await scalar(db, "select status from public.payments where id='50000000-0000-4000-8000-000000000902'"), 'confirmed');
      await db.exec(`update public.ecpay_orders set amount=17800,
        member_id='30000000-0000-4000-8000-000000000999',
        plan_id='10000000-0000-4000-8000-000000000003',
        paid_at='2026-09-23T18:19:24Z',status='confirmed'
        where id='50000000-0000-4000-8000-000000000902'`);
    }
    await reverse(db, 902);
    assert.deepEqual(await subscriptionOf(db), {
      current_plan_id: IDS.plan,
      plan_started_at: '2026-09-23T14:08:07.000Z',
      plan_expires_at: '2026-10-23T14:08:07.000Z',
      is_lifetime: false,
      auto_renew: false,
    });
  } finally { await db.close(); }
});

test('legacy manual receipts without grant evidence cannot be guessed from payment time', async () => {
  const db = await setupTwoPurchases();
  try {
    await db.exec(`
      insert into public.transfer_requests(id,member_id,plan_id,amount,account_last_five,transferred_at,status)
      values('60000000-0000-4000-8000-000000000901','30000000-0000-4000-8000-000000000999',
        '${IDS.plan}',2880,'12345','2026-09-23T14:08:07Z','confirmed');
      update public.payments set transfer_request_id='60000000-0000-4000-8000-000000000901',
        entitlement_granted_at=null,entitlement_revision=null
      where id='50000000-0000-4000-8000-000000000901';
    `);
    const before = await subscriptionOf(db);
    for (const payment of [901, 902]) {
      await assert.rejects(() => reverse(db, payment), /PAYMENT_ENTITLEMENT_CONFLICT/);
      assert.deepEqual(await subscriptionOf(db), before);
    }
    assert.equal(await scalar(db, `select count(*)::int from public.payments
      where member_id='30000000-0000-4000-8000-000000000999' and status='confirmed'`), 2);
  } finally { await db.close(); }
});

test('legacy payments sharing a receipt timestamp fail safely without application-order evidence', async () => {
  const db = await setupTwoPurchases();
  try {
    await useMatchedLegacyEcpayGrants(db);
    await db.exec(`
      update public.payments set paid_at='2026-09-23T14:08:07Z'
      where id='50000000-0000-4000-8000-000000000902';
      update public.ecpay_orders set paid_at='2026-09-23T14:08:07Z'
      where id='50000000-0000-4000-8000-000000000902';
    `);
    const before = await subscriptionOf(db);
    await assert.rejects(() => reverse(db, 902), /PAYMENT_ENTITLEMENT_CONFLICT/);
    assert.deepEqual(await subscriptionOf(db), before);
    assert.equal(await scalar(db, "select status from public.payments where id='50000000-0000-4000-8000-000000000902'"), 'confirmed');
  } finally { await db.close(); }
});

test('grant evidence keeps the existing missing-receipt guard and cannot be partially stored', async () => {
  const db = await setupTwoPurchases();
  try {
    for (const incomplete of ['entitlement_granted_at=null', 'entitlement_revision=null', 'entitlement_revision=0']) {
      await assert.rejects(db.exec(`update public.payments set ${incomplete}
        where id='50000000-0000-4000-8000-000000000902'`), /payments_entitlement_evidence_check/);
    }
    await db.exec("update public.payments set paid_at=null where id='50000000-0000-4000-8000-000000000902'");
    const before = await subscriptionOf(db);
    await assert.rejects(() => reverse(db, 902), /PAYMENT_ENTITLEMENT_CONFLICT/);
    assert.deepEqual(await subscriptionOf(db), before);
    assert.equal(await scalar(db, "select status from public.payments where id='50000000-0000-4000-8000-000000000902'"), 'confirmed');
  } finally { await db.close(); }
});

test('payment reversal is atomic, restricted, idempotent, and preserves unrelated billing data', async () => {
  const db = await setup();
  try {
    const beforeMember = await scalar(db, `
      select pg_catalog.to_jsonb(member) - 'invitation_code'
      from public.members as member
      where id = '30000000-0000-4000-8000-000000000002'
    `);
    const first = await reverse(db, 51, 'refunded', IDS.superActor, '退款已由銀行完成');
    assert.equal(first.status, 'refunded');
    assert.equal(first.referralSuccessCount, 50);
    assert.equal(await scalar(db, `select count(*)::int from public.audit_logs where target_id = '50000000-0000-4000-8000-000000000051'`), 0);

    const retry = await reverse(db, 51, 'refunded', IDS.superActor, '不同的重試理由');
    assert.equal(retry.reversedAt, first.reversedAt);
    assert.equal(retry.reversalReason, '退款已由銀行完成');
    assert.equal(retry.reversedBy, IDS.superActor);
    assert.equal(await scalar(db, `select count(*)::int from public.audit_logs where target_id = '50000000-0000-4000-8000-000000000051'`), 0);

    await assert.rejects(() => reverse(db, 51, 'chargeback'), /PAYMENT_REVERSAL_CONFLICT/);
    assert.equal(await scalar(db, `select status from public.payments where id = '50000000-0000-4000-8000-000000000051'`), 'refunded');

    const second = await reverse(db, 1, 'chargeback');
    const third = await reverse(db, 2, 'cancelled');
    assert.equal(second.status, 'chargeback');
    assert.equal(third.status, 'cancelled');
    assert.equal(second.referralSuccessCount, 49);

    const preservedPayment = await db.query(`
      select amount, paid_at, member_id, plan_id
      from public.payments where id = '50000000-0000-4000-8000-000000000001'
    `);
    assert.equal(preservedPayment.rows[0].amount, 2880);
    assert.equal(preservedPayment.rows[0].paid_at.toISOString(), '2026-02-01T00:00:00.000Z');
    assert.equal(preservedPayment.rows[0].member_id, '30000000-0000-4000-8000-000000000002');
    assert.equal(preservedPayment.rows[0].plan_id, IDS.plan);
    assert.notDeepEqual(
      await scalar(db, `select pg_catalog.to_jsonb(member) - 'invitation_code' from public.members as member where id = '30000000-0000-4000-8000-000000000002'`),
      beforeMember,
    );
    assert.equal((await subscriptionOf(db, '30000000-0000-4000-8000-000000000002')).current_plan_id, null);

    assert.equal(await scalar(db, `select has_function_privilege('anon', 'public.admin_record_payment_reversal(uuid,text,text,uuid,text)', 'EXECUTE')`), false);
    assert.equal(await scalar(db, `select has_function_privilege('authenticated', 'public.admin_record_payment_reversal(uuid,text,text,uuid,text)', 'EXECUTE')`), false);
    assert.equal(await scalar(db, `select has_function_privilege('service_role', 'public.admin_record_payment_reversal(uuid,text,text,uuid,text)', 'EXECUTE')`), true);
  } finally {
    await db.close();
  }
});

test('reversal recomputes canonical distinct referral counts and 10/15/30/50 rewards', async () => {
  const db = await setup();
  try {
    assert.equal((await scalar(db, 'select public.member_referral_summary()')).referralSuccessCount, 50);
    let entitlements = await scalar(db, 'select private.matrix_result_entitlements()');
    assert.equal(entitlements.canUseFullRange, true);

    await reverse(db, 51);
    for (let n = 1; n <= 20; n += 1) await reverse(db, n, n === 1 ? 'chargeback' : n === 2 ? 'cancelled' : 'refunded');
    assert.equal((await scalar(db, 'select public.member_referral_summary()')).referralSuccessCount, 30);
    const day = Number(await scalar(db, `select extract(isodow from pg_catalog.timezone('Asia/Taipei', pg_catalog.now()))::int`));
    entitlements = await scalar(db, 'select private.matrix_result_entitlements()');
    assert.equal(entitlements.canUseFullRange, [2, 5].includes(day));

    for (let n = 21; n <= 35; n += 1) await reverse(db, n);
    assert.equal((await scalar(db, 'select public.member_referral_summary()')).referralSuccessCount, 15);
    entitlements = await scalar(db, 'select private.matrix_result_entitlements()');
    assert.equal(entitlements.canUseSeven, true);
    assert.equal(entitlements.canUseFullRange, false);

    for (let n = 36; n <= 40; n += 1) await reverse(db, n);
    assert.equal((await scalar(db, 'select public.member_referral_summary()')).referralSuccessCount, 10);
    entitlements = await scalar(db, 'select private.matrix_result_entitlements()');
    assert.equal(entitlements.canUseSeven, [1, 2, 4, 5].includes(day));

    await reverse(db, 41);
    entitlements = await scalar(db, 'select private.matrix_result_entitlements()');
    assert.equal(entitlements.canUseSeven, [2, 5].includes(day));
    assert.equal(entitlements.canUseFullRange, false);

    await db.exec(`
      update public.members set current_plan_id = '${IDS.plan}', plan_expires_at = pg_catalog.now() + interval '1 day'
      where id = '${IDS.referrer}';
    `);
    entitlements = await scalar(db, 'select private.matrix_result_entitlements()');
    assert.equal(entitlements.canUseSeven, true);
    assert.equal(entitlements.canUseThirteen, true);
    assert.equal(entitlements.canUseFullRange, true);

    await db.exec(`update public.members set current_plan_id = '${IDS.trialPlan}' where id = '${IDS.referrer}'`);
    entitlements = await scalar(db, 'select private.matrix_result_entitlements()');
    assert.equal(entitlements.canUseThirteen, true);
    assert.equal(entitlements.canCustomizeStatus, false);
  } finally {
    await db.close();
  }
});

test('invalid transitions and late payment write failures roll back, while member history prefers terminal payment status', async () => {
  const db = await setup();
  try {
    await db.exec(`
      insert into public.transfer_requests (
        id, member_id, plan_id, amount, account_last_five, submitted_at, status
      ) values (
        '60000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000002',
        '${IDS.plan}', 2880, '12345', '2026-02-01T00:00:00Z', 'confirmed'
      );
      update public.payments
      set transfer_request_id = '60000000-0000-4000-8000-000000000001'
      where id = '50000000-0000-4000-8000-000000000001';
      insert into public.payments (id, member_id, plan_id, amount, status) values
        ('50000000-0000-4000-8000-000000000052', '30000000-0000-4000-8000-000000000003', '${IDS.plan}', 1, 'pending'),
        ('50000000-0000-4000-8000-000000000053', '30000000-0000-4000-8000-000000000004', '${IDS.plan}', 1, 'rejected');
    `);
    for (const args of [
      [null, 'refunded', '完成'],
      ['50000000-0000-4000-8000-000000000999', 'refunded', '完成'],
      ['50000000-0000-4000-8000-000000000052', 'refunded', '完成'],
      ['50000000-0000-4000-8000-000000000053', 'cancelled', '完成'],
      ['50000000-0000-4000-8000-000000000001', 'invalid', '完成'],
      ['50000000-0000-4000-8000-000000000001', 'refunded', ''],
      ['50000000-0000-4000-8000-000000000001', 'refunded', '\t\n  '],
      ['50000000-0000-4000-8000-000000000001', 'refunded', '理'.repeat(501)],
    ]) {
      await assert.rejects(
        () => db.query('select public.admin_record_payment_reversal($1::uuid, $2::text, $3::text, $4::uuid, $5::text)', [...args, IDS.superActor, '超級管理員']),
      );
    }

    await assert.rejects(
      () => reverse(db, 1, 'refunded', '20000000-0000-4000-8000-999999999999'),
      /ADMIN_ACTOR_NOT_FOUND/,
    );
    assert.equal(await scalar(db, `select status from public.payments where id = '50000000-0000-4000-8000-000000000001'`), 'confirmed');

    await reverse(db, 1, 'refunded', IDS.superActor, '超級管理員已確認退款完成');
    assert.equal(await scalar(db, `select count(*)::int from public.audit_logs where target_id = '50000000-0000-4000-8000-000000000001'`), 0);
    assert.equal(await scalar(db, `select reversal_reason from public.payments where id = '50000000-0000-4000-8000-000000000001'`), '超級管理員已確認退款完成');
    await db.exec(`
      create function public.reject_test_payment_update() returns trigger
      language plpgsql set search_path = '' as $$
      begin
        if new.id = '50000000-0000-4000-8000-000000000003' then
          raise exception 'TEST_PAYMENT_WRITE_FAILURE';
        end if;
        return new;
      end;
      $$;
      create trigger reject_test_payment_update
        before update on public.payments
        for each row execute function public.reject_test_payment_update();
    `);
    const memberBefore = await subscriptionOf(db, '30000000-0000-4000-8000-000000000004');
    await assert.rejects(() => reverse(db, 3), /TEST_PAYMENT_WRITE_FAILURE/);
    assert.equal(await scalar(db, `select status from public.payments where id = '50000000-0000-4000-8000-000000000003'`), 'confirmed');
    assert.deepEqual(await subscriptionOf(db, '30000000-0000-4000-8000-000000000004'), memberBefore);

    await db.exec(`delete from public.admin_accounts where id = '${IDS.superActor}'`);
    assert.equal(await scalar(db, `select reversed_by from public.payments where id = '50000000-0000-4000-8000-000000000001'`), IDS.superActor);

    await db.exec(`select pg_catalog.set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000002', false)`);
    const history = await scalar(db, 'select public.member_payment_history_get()');
    assert.equal(history[0].status, 'refunded');
    assert.equal(await scalar(db, `select status from public.transfer_requests where id = '60000000-0000-4000-8000-000000000001'`), 'confirmed');
  } finally {
    await db.close();
  }
});
