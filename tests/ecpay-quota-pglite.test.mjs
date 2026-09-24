import assert from 'node:assert/strict';
import test from 'node:test';
import { setup, service, owner, userId, memberId, planId, merchant } from './helpers/ecpay-db.mjs';

const migration = new URL('../supabase/migrations/20260923234853_ecpay_quota_reconciliation.sql', import.meta.url);
async function create(db, number = 'NEWCHECKOUT') {
  return db.query('select public.ecpay_order_create_with_quota($1,$2,$3,$4) as result', [userId, 'month', number, merchant]);
}
async function seed(db, amount, state, at = new Date(), number = 'EXISTING', merchantId = merchant) {
  await owner(db);
  await db.query(`insert into public.ecpay_orders(member_id,plan_id,merchant_id,merchant_trade_no,amount,quota_state,quota_at)
    values($1,$2,$3,$4,$5,$6,$7)`, [memberId, planId, merchantId, number, amount, state, state === 'occupied' ? at : null]);
  await service(db);
}
async function record(db, state, status, type = 'Credit_CreditCard', number = 'EXISTING', amount = 198000) {
  return db.query('select public.ecpay_quota_record($1,$2,$3,$4,$5,$6,$7,$8)',
    [merchant, number, amount, state, type, status, state === 'occupied' ? new Date() : null, 'PROVIDER123']);
}

test('exactly 200000 is allowed; confirmed insufficient quota does not create an order', async () => {
  const db = await setup(migration);
  try {
    await seed(db, 197120, 'occupied');
    assert.equal((await create(db)).rows[0].result.amount, 2880);
    await assert.rejects(create(db, 'COMPETING'), /ECPAY_QUOTA_UNCERTAIN/);
    await record(db, 'occupied', '1', 'Credit_CreditCard', 'NEWCHECKOUT', 2880);
    await assert.rejects(create(db, 'SECOND'), /ECPAY_QUOTA_LIMIT/);
    assert.equal((await db.query('select count(*)::integer as count from public.ecpay_orders')).rows[0].count, 2);
  } finally { await db.close(); }
});
test('unpaid reservations cause uncertainty, never a confirmed quota-full decision; verified failed orders free the reservation', async () => {
  const db = await setup(migration);
  try {
    await seed(db, 198000, 'reserved');
    await assert.rejects(create(db), /ECPAY_QUOTA_UNCERTAIN/);
    await record(db, 'released', '10200095');
    assert.equal((await create(db)).rows[0].result.amount, 2880);
  } finally { await db.close(); }
});
test('the rolling window uses Taiwan calendar dates and excludes other merchants', async () => {
  const db = await setup(migration);
  try {
    const { rows: [{ cutoff }] } = await db.query("select (((now() at time zone 'Asia/Taipei')::date - 29)::timestamp at time zone 'Asia/Taipei') as cutoff");
    await seed(db, 198000, 'occupied', new Date(new Date(cutoff).getTime() - 1));
    await seed(db, 200000, 'occupied', new Date(), 'OTHER', '9999999');
    assert.equal((await create(db)).rows[0].result.amount, 2880);
    await owner(db);
    await db.query("update public.ecpay_orders set quota_at=$1 where merchant_trade_no='EXISTING'", [cutoff]);
    await service(db);
    await assert.rejects(create(db, 'ATBOUNDARY'), /ECPAY_QUOTA_LIMIT/);
  } finally { await db.close(); }
});
test('old unresolved reservations cannot silently age out while a payment could still complete', async () => {
  const db = await setup(migration);
  try {
    await seed(db, 198000, 'reserved');
    await owner(db);
    await db.exec("update public.ecpay_orders set created_at=now()-interval '60 days'");
    await service(db);
    await assert.rejects(create(db), /ECPAY_QUOTA_UNCERTAIN/);
  } finally { await db.close(); }
});
test('unpaid ATM issuance occupies quota; stale credit-pending and failed events cannot erase occupied evidence', async () => {
  const db = await setup(migration);
  try {
    await seed(db, 198000, 'reserved');
    await record(db, 'occupied', '0', 'ATM_TAISHIN');
    await record(db, 'reserved', '0');
    await record(db, 'released', '10200095');
    await assert.rejects(create(db), /ECPAY_QUOTA_LIMIT/);
    await assert.rejects(record(db, 'occupied', '1', 'Credit_CreditCard', 'EXISTING', 1), /ORDER_MISMATCH/);
    assert.equal((await db.query('select count(*)::integer as count from public.payments')).rows[0].count, 0);
  } finally { await db.close(); }
});
test('public callers cannot read or change quota evidence, and plan entitlement checks remain enforced', async () => {
  const db = await setup(migration);
  try {
    await db.exec('set role authenticated');
    await assert.rejects(create(db), /permission denied/);
    await assert.rejects(record(db, 'occupied', '1'), /permission denied/);
    await owner(db);
    await db.exec('update public.members set is_lifetime=true');
    await service(db);
    await assert.rejects(create(db), /LIFETIME_PURCHASE_BLOCKED/);
  } finally { await db.close(); }
});
test('paid unknown methods remain unresolved, and verified gateway payments release only their own reservation', async () => {
  const db = await setup(migration);
  try {
    await seed(db, 198000, 'reserved');
    for (const type of ['NewMethod', '', 'TWQR_OPAY', 'BNPL_URICH', 'WeiXin_OPAY']) {
      await assert.rejects(record(db, 'occupied', '1', type), /INVALID_QUOTA_EVIDENCE/);
    }
    await record(db, 'reserved', '1', 'NewMethod');
    await assert.rejects(create(db), /ECPAY_QUOTA_UNCERTAIN/);
    await assert.rejects(record(db, 'released', '1', 'NewMethod'), /INVALID_QUOTA_EVIDENCE/);
    await record(db, 'released', '1', 'TWQR_OPAY');
    assert.equal((await create(db)).rows[0].result.amount, 2880);
  } finally { await db.close(); }
});
test('reconciliation claims are bounded and throttled; recent checkouts are not polled immediately', async () => {
  const db = await setup(migration);
  try {
    await seed(db, 2880, 'reserved');
    await owner(db);
    await db.exec("update public.ecpay_orders set created_at=now()-interval '20 minutes'");
    await service(db);
    const first = (await db.query('select public.ecpay_quota_reconcile_claim($1) as orders', [merchant])).rows[0].orders;
    assert.equal(first.length, 1);
    assert.equal(first[0].merchantTradeNo, 'EXISTING');
    assert.deepEqual((await db.query('select public.ecpay_quota_reconcile_claim($1) as orders', [merchant])).rows[0].orders, []);
  } finally { await db.close(); }
});
test('unqueryable old orders cannot monopolize later reconciliation batches', async () => {
  const db = await setup(migration);
  try {
    for (const number of ['BAD1','BAD2','BAD3','BAD4','BAD5','GOOD6']) {
      await seed(db, 2880, 'reserved', new Date(), number);
    }
    await owner(db);
    await db.exec("update public.ecpay_orders set created_at=now()-interval '20 minutes'+right(merchant_trade_no,1)::integer*interval '1 second'");
    await service(db);
    const claim = () => db.query('select public.ecpay_quota_reconcile_claim($1) as orders', [merchant]);
    const first = (await claim()).rows[0].orders;
    assert.equal(first.length, 5);
    assert.equal(first.some(order => order.merchantTradeNo === 'GOOD6'), false);
    // No result was recorded for these failed queries; retry after their leases elapsed.
    await owner(db);
    await db.exec("update public.ecpay_quota_reconciliation set retry_after=now()-interval '1 minute'; update public.ecpay_orders set quota_check_after=quota_check_after-interval '11 minutes'");
    await service(db);
    const second = (await claim()).rows[0].orders;
    assert.equal(second.length, 5);
    assert.equal(second.some(order => order.merchantTradeNo === 'GOOD6'), true);
  } finally { await db.close(); }
});
