import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { setup, service, owner, userId, memberId, planId, number, merchant } from './helpers/ecpay-db.mjs';

const quotaMigration = new URL('../supabase/migrations/20260924001807_ecpay_quota_reconciliation.sql', import.meta.url);
const recoveryMigration = new URL('../supabase/migrations/20260924041358_ecpay_paid_recovery.sql', import.meta.url);
const improvementMigration = new URL('../supabase/migrations/20260924051512_ecpay_offline_recovery_and_paid_date.sql', import.meta.url);
const historyMigration = new URL('../supabase/migrations/20260924065325_ecpay_failed_history_status.sql', import.meta.url);
const tradeNo = '2609231234567890';
const paidEvidence = [merchant, number, 2880, 'occupied', 'Credit_CreditCard', '1', new Date('2026-09-23T02:30:00Z'), tradeNo];

async function ready() {
  const db = await setup(quotaMigration);
  const source = await readFile(recoveryMigration, 'utf8');
  await db.exec(source.split('-- Scheduled invocation')[0]);
  await db.exec(await readFile(improvementMigration, 'utf8'));
  await db.exec(await readFile(historyMigration, 'utf8'));
  await service(db);
  await db.query('select public.ecpay_order_create_with_quota($1,$2,$3,$4)', [userId, 'month', number, merchant]);
  await owner(db);
  await db.exec("update public.ecpay_orders set created_at=now()-interval '45 minutes'");
  await service(db);
  return db;
}

async function recover(db, evidence = paidEvidence) {
  return db.query('select public.ecpay_paid_reconcile($1,$2,$3,$4,$5,$6,$7,$8) as result', evidence);
}

test('a lost callback is recovered from a paid provider response and grants exactly once', async () => {
  const db = await ready();
  try {
    const claim = (await db.query('select public.ecpay_quota_reconcile_claim($1) as orders', [merchant])).rows[0].orders;
    assert.equal(claim.length, 1);
    assert.equal(claim[0].merchantTradeNo, number);
    assert.equal((await recover(db)).rows[0].result.status, 'confirmed');
    assert.equal((await recover(db)).rows[0].result.status, 'confirmed');
    const { rows: [member] } = await db.query('select current_plan_id,plan_expires_at,subscription_revision from public.members where id=$1', [memberId]);
    assert.equal(member.current_plan_id, planId);
    assert.equal(new Date(member.plan_expires_at).toISOString(), '2099-01-31T00:00:00.000Z');
    assert.equal(member.subscription_revision, 1);
    const { rows: [order] } = await db.query('select status,quota_state,quota_provider_status from public.ecpay_orders where merchant_trade_no=$1', [number]);
    assert.deepEqual(order, { status: 'confirmed', quota_state: 'occupied', quota_provider_status: '1' });
    assert.equal((await db.query('select count(*)::integer as count from public.payments')).rows[0].count, 1);
  } finally { await db.close(); }
});

test('a provider-confirmed failed ECPay order is shown as failed without changing its pending order row', async () => {
  const db = await ready();
  try {
    await db.query('select public.ecpay_quota_record($1,$2,$3,$4,$5,$6,$7,$8)',
      [merchant, number, 2880, 'released', 'Credit_CreditCard', '10200095', null, '']);
    await owner(db);
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userId}'`);
    const { rows: [result] } = await db.query('select public.member_payment_history_get() as history');
    assert.equal(result.history.length, 1);
    assert.equal(result.history[0].status, 'failed');
    await owner(db);
    const { rows: [order] } = await db.query('select status from public.ecpay_orders where merchant_trade_no=$1', [number]);
    assert.equal(order.status, 'pending');
    assert.equal((await db.query('select count(*)::integer as count from public.payments')).rows[0].count, 0);
  } finally { await db.close(); }
});

test('issued but unpaid orders can be claimed later, including after quota evidence was written', async () => {
  const db = await ready();
  try {
    await db.query('select public.ecpay_quota_record($1,$2,$3,$4,$5,$6,$7,$8)',
      [merchant, number, 2880, 'occupied', 'ATM_TAISHIN', '0', new Date('2026-09-23T02:30:00Z'), tradeNo]);
    const { rows: [scheduled] } = await db.query(`select quota_check_after between
      now()+interval '59 minutes' and now()+interval '61 minutes' as hourly,
      quota_at='2026-09-23T02:30:00Z'::timestamptz as issued_at
      from public.ecpay_orders where merchant_trade_no=$1`, [number]);
    assert.deepEqual(scheduled, { hourly: true, issued_at: true });
    assert.deepEqual((await db.query('select public.ecpay_quota_reconcile_claim($1) as orders', [merchant])).rows[0].orders, []);
    await owner(db);
    await db.exec("update public.ecpay_orders set quota_check_after=now()-interval '1 minute'; update public.ecpay_quota_reconciliation set retry_after=now()-interval '1 minute'");
    await service(db);
    const claim = (await db.query('select public.ecpay_quota_reconcile_claim($1) as orders', [merchant])).rows[0].orders;
    assert.equal(claim.length, 1);
    assert.deepEqual(claim[0], {
      merchantId: merchant, merchantTradeNo: number, amount: 2880,
      quotaState: 'occupied', quotaProviderStatus: '0', quotaPaymentType: 'ATM_TAISHIN', quotaTradeNo: tradeNo,
    });
    const { rows: [claimed] } = await db.query(`select quota_check_after between
      now()+interval '59 minutes' and now()+interval '61 minutes' as hourly
      from public.ecpay_orders where merchant_trade_no=$1`,[number]);
    assert.equal(claimed.hourly,true);
    assert.equal((await db.query('select count(*)::integer as count from public.payments')).rows[0].count, 0);
    await recover(db, [merchant, number, 2880, 'occupied', 'ATM_TAISHIN', '1', new Date('2026-09-23T02:30:00Z'), tradeNo]);
    assert.equal((await db.query('select count(*)::integer as count from public.payments')).rows[0].count, 1);
  } finally { await db.close(); }
});

test('verified provider payment date is preserved separately from entitlement grant time', async () => {
  const db = await ready();
  try {
    const providerPaidAt = new Date(Date.now() - 10 * 60_000);
    const evidence = [...paidEvidence.slice(0, 6), providerPaidAt, tradeNo, providerPaidAt];
    for (let attempt = 0; attempt < 2; attempt++) {
      const { rows: [result] } = await db.query(
        'select public.ecpay_paid_reconcile($1,$2,$3,$4,$5,$6,$7,$8,$9) as result', evidence);
      assert.equal(result.result.status, 'confirmed');
    }
    const { rows: [receipt] } = await db.query(`select o.paid_at as order_paid_at,
      p.paid_at as payment_paid_at, p.entitlement_granted_at as granted_at,
      m.plan_expires_at as expires_at from public.ecpay_orders o
      join public.payments p on p.ecpay_order_id=o.id
      join public.members m on m.id=o.member_id`);
    assert.equal(receipt.order_paid_at.toISOString(), providerPaidAt.toISOString());
    assert.equal(receipt.payment_paid_at.toISOString(), providerPaidAt.toISOString());
    assert.ok(receipt.granted_at > providerPaidAt);
    assert.equal(receipt.expires_at.toISOString(), '2099-01-31T00:00:00.000Z');
    assert.equal((await db.query('select count(*)::integer as count from public.payments')).rows[0].count, 1);
  } finally { await db.close(); }
});

test('late offline issuance cannot downgrade paid quota evidence', async () => {
  const db = await ready();
  try {
    const issuedAt = new Date('2026-09-23T02:30:00Z');
    const providerPaidAt = new Date(Date.now() - 10 * 60_000);
    const params = [merchant,number,2880,'occupied','ATM_TAISHIN','1',issuedAt,tradeNo,providerPaidAt];
    await db.query('select public.ecpay_paid_reconcile($1,$2,$3,$4,$5,$6,$7,$8,$9)',params);
    await db.query('select public.ecpay_quota_record($1,$2,$3,$4,$5,$6,$7,$8)',
      [merchant,number,2880,'occupied','ATM_TAISHIN','0',issuedAt,tradeNo]);
    const { rows: [order] } = await db.query(`select status, quota_provider_status, quota_check_after,
      paid_at from public.ecpay_orders where merchant_trade_no=$1`,[number]);
    assert.equal(order.status,'confirmed');
    assert.equal(order.quota_provider_status,'1');
    assert.equal(order.paid_at.toISOString(),providerPaidAt.toISOString());
  } finally { await db.close(); }
});

test('unpaid WebATM avoids ten-minute provider rechecks without requesting offline issuance', async () => {
  const db = await ready();
  try {
    await db.query('select public.ecpay_quota_record($1,$2,$3,$4,$5,$6,$7,$8)',
      [merchant,number,2880,'occupied','WebATM_ESUN','0',new Date('2026-09-23T02:30:00Z'),tradeNo]);
    const { rows: [order] } = await db.query(`select quota_check_after between
      now()+interval '59 minutes' and now()+interval '61 minutes' as hourly
      from public.ecpay_orders where merchant_trade_no=$1`,[number]);
    assert.equal(order.hourly,true);
  } finally { await db.close(); }
});

test('verified paid date does not turn a lifetime-member refund into an entitlement', async () => {
  const db = await ready();
  try {
    const providerPaidAt = new Date(Date.now() - 10 * 60_000);
    await owner(db);
    await db.exec(`update public.members set is_lifetime=true where id='${memberId}'`);
    await service(db);
    const { rows: [prior] } = await db.query(`select subscription_revision
      from public.members where id=$1`,[memberId]);
    const { rows: [result] } = await db.query(
      'select public.ecpay_paid_reconcile($1,$2,$3,$4,$5,$6,$7,$8,$9) as result',
      [...paidEvidence.slice(0, 6),providerPaidAt,tradeNo,providerPaidAt]);
    assert.equal(result.result.status,'refund_required');
    const { rows: [receipt] } = await db.query(`select o.status as order_status,
      p.status as payment_status,p.paid_at,p.entitlement_granted_at,
      m.subscription_revision from public.ecpay_orders o
      join public.payments p on p.ecpay_order_id=o.id join public.members m on m.id=o.member_id`);
    assert.equal(receipt.order_status,'refund_required');
    assert.equal(receipt.payment_status,'refund_required');
    assert.equal(receipt.paid_at.toISOString(),providerPaidAt.toISOString());
    assert.equal(receipt.entitlement_granted_at,null);
    assert.equal(receipt.subscription_revision,prior.subscription_revision);
  } finally { await db.close(); }
});

test('a paid callback interrupted after quota recording remains eligible for recovery', async () => {
  const db = await ready();
  try {
    await db.query('select public.ecpay_quota_record($1,$2,$3,$4,$5,$6,$7,$8)', paidEvidence);
    await owner(db);
    await db.exec("update public.ecpay_orders set quota_check_after=now()-interval '1 minute'");
    await service(db);
    const claim = (await db.query('select public.ecpay_quota_reconcile_claim($1) as orders', [merchant])).rows[0].orders;
    assert.equal(claim.length, 1);
    assert.equal(claim[0].merchantTradeNo, number);
    await recover(db);
    await db.query('select public.ecpay_payment_confirm($1,$2,$3,$4)', [number,merchant,tradeNo,2880]);
    assert.equal((await db.query('select count(*)::integer as count from public.payments')).rows[0].count, 1);
  } finally { await db.close(); }
});

test('a failed grant rolls back quota writes and retries after a membership problem is fixed', async () => {
  const db = await ready();
  try {
    await owner(db);
    await db.exec('revoke insert on public.payments from service_role');
    await service(db);
    await assert.rejects(recover(db), /permission denied/);
    const { rows: [order] } = await db.query('select status,quota_state from public.ecpay_orders where merchant_trade_no=$1', [number]);
    assert.deepEqual(order, { status: 'pending', quota_state: 'reserved' });
    await owner(db);
    await db.exec('grant insert on public.payments to service_role');
    await service(db);
    assert.equal((await recover(db)).rows[0].result.status, 'confirmed');
  } finally { await db.close(); }
});

test('incorrect paid evidence cannot change quota or grant, and public roles cannot call recovery', async () => {
  const db = await ready();
  try {
    await assert.rejects(recover(db, [merchant,number,1,...paidEvidence.slice(3)]), /ORDER_MISMATCH/);
    await assert.rejects(recover(db, [merchant,number,2880,'occupied','Credit_CreditCard','0',paidEvidence[6],tradeNo]), /INVALID_PAID_EVIDENCE/);
    await db.exec('set role authenticated');
    await assert.rejects(recover(db), /permission denied/);
    await assert.rejects(db.query('select public.ecpay_paid_reconcile($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [...paidEvidence,new Date()]), /permission denied/);
    await service(db);
    assert.equal((await db.query('select count(*)::integer as count from public.payments')).rows[0].count, 0);
  } finally { await db.close(); }
});
