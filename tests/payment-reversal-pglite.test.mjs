import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(
  new URL('../supabase/migrations/20260908210936_record_payment_reversal.sql', import.meta.url),
  'utf8',
);

const referralMigration = readFileSync(
  new URL('../supabase/migrations/20260905090000_allow_referral_code_after_payment.sql', import.meta.url),
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
      role text not null
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
    insert into public.payments (id, member_id, plan_id, amount, paid_at, status)
    select
      ('50000000-0000-4000-8000-' || pg_catalog.lpad(n::text, 12, '0'))::uuid,
      ('30000000-0000-4000-8000-' || pg_catalog.lpad((n + 1)::text, 12, '0'))::uuid,
      '${IDS.plan}',
      2880,
      '2026-02-01T00:00:00Z',
      'confirmed'
    from pg_catalog.generate_series(1, 50) as generated(n);
    insert into public.payments (id, member_id, plan_id, amount, paid_at, status)
    values (
      '50000000-0000-4000-8000-000000000051',
      '30000000-0000-4000-8000-000000000002',
      '${IDS.plan}', 2880, '2026-02-02T00:00:00Z', 'confirmed'
    );
    select pg_catalog.set_config('request.jwt.claim.sub', '${IDS.referrerAuth}', false);
  `);
  return db;
}

async function scalar(db, sql, params = []) {
  const result = await db.query(sql, params);
  return Object.values(result.rows[0])[0];
}

async function reverse(db, number, status = 'refunded', actor = IDS.actor, reason = `已完成沖銷 ${number}`) {
  const paymentId = `50000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
  const result = await db.query(
    `select public.admin_record_payment_reversal($1::uuid, $2::text, $3::text, $4::uuid, '營運管理員') as value`,
    [paymentId, status, reason, actor],
  );
  return result.rows[0].value;
}

test('payment reversal is atomic, restricted, idempotent, and preserves unrelated billing data', async () => {
  const db = await setup();
  try {
    const beforeMember = await scalar(db, `
      select pg_catalog.to_jsonb(member) - 'invitation_code'
      from public.members as member
      where id = '30000000-0000-4000-8000-000000000002'
    `);
    const first = await reverse(db, 51, 'refunded', IDS.actor, '退款已由銀行完成');
    assert.equal(first.status, 'refunded');
    assert.equal(first.referralSuccessCount, 50);
    assert.equal(await scalar(db, `select count(*)::int from public.audit_logs where target_id = '50000000-0000-4000-8000-000000000051'`), 1);

    const retry = await reverse(db, 51, 'refunded', IDS.superActor, '不同的重試理由');
    assert.equal(retry.reversedAt, first.reversedAt);
    assert.equal(retry.reversalReason, '退款已由銀行完成');
    assert.equal(retry.reversedBy, IDS.actor);
    assert.equal(await scalar(db, `select count(*)::int from public.audit_logs where target_id = '50000000-0000-4000-8000-000000000051'`), 1);

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
    assert.deepEqual(
      await scalar(db, `select pg_catalog.to_jsonb(member) - 'invitation_code' from public.members as member where id = '30000000-0000-4000-8000-000000000002'`),
      beforeMember,
    );

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

test('invalid transitions and late audit failures roll back, while member history prefers terminal payment status', async () => {
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
        () => db.query('select public.admin_record_payment_reversal($1::uuid, $2::text, $3::text, $4::uuid, $5::text)', [...args, IDS.actor, '營運管理員']),
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
    await db.exec(`delete from public.admin_accounts where id = '${IDS.superActor}'`);
    assert.equal(await scalar(db, `select reversed_by from public.payments where id = '50000000-0000-4000-8000-000000000001'`), IDS.superActor);

    await db.exec(`
      create function public.reject_test_payment_audit() returns trigger
      language plpgsql set search_path = '' as $$
      begin
        if new.target_id = '50000000-0000-4000-8000-000000000003' then
          raise exception 'TEST_AUDIT_FAILURE';
        end if;
        return new;
      end;
      $$;
      create trigger z_reject_test_payment_audit
        before insert on public.audit_logs
        for each row execute function public.reject_test_payment_audit();
    `);
    await assert.rejects(() => reverse(db, 3), /TEST_AUDIT_FAILURE/);
    assert.equal(await scalar(db, `select status from public.payments where id = '50000000-0000-4000-8000-000000000003'`), 'confirmed');

    await db.exec(`select pg_catalog.set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000002', false)`);
    const history = await scalar(db, 'select public.member_payment_history_get()');
    assert.equal(history[0].status, 'refunded');
    assert.equal(await scalar(db, `select status from public.transfer_requests where id = '60000000-0000-4000-8000-000000000001'`), 'confirmed');
  } finally {
    await db.close();
  }
});
