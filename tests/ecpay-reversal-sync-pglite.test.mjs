import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { setup, service, owner, userId, memberId, number, merchant } from './helpers/ecpay-db.mjs';

const quota = new URL('../supabase/migrations/20260924001807_ecpay_quota_reconciliation.sql', import.meta.url);
const recovery = new URL('../supabase/migrations/20260924041358_ecpay_paid_recovery.sql', import.meta.url);
const improvement = new URL('../supabase/migrations/20260924051512_ecpay_offline_recovery_and_paid_date.sql', import.meta.url);
const history = new URL('../supabase/migrations/20260924065325_ecpay_failed_history_status.sql', import.meta.url);
const reversalSync = new URL('../supabase/migrations/20260924121843_sync_ecpay_payment_reversals.sql', import.meta.url);
const actor = '30000000-0000-4000-8000-000000000001';
const tradeNo = '2609231234567890';
const paidAt = new Date('2026-09-23T02:30:00Z');
const evidence = [merchant, number, 2880, 'occupied', 'Credit_CreditCard', '1', paidAt, tradeNo, paidAt];

async function ready({ migration = true, lifetime = false } = {}) {
  const db = await setup(quota);
  const source = await readFile(recovery, 'utf8');
  await db.exec(source.split('-- Scheduled invocation')[0]);
  await db.exec(await readFile(improvement, 'utf8'));
  await db.exec(await readFile(history, 'utf8'));
  await owner(db);
  await db.exec(`update public.members set plan_expires_at=null where id='${memberId}';
    insert into public.admin_accounts(id,role,status) values ('${actor}','超級管理員','啟用');`);
  await service(db);
  await db.query('select public.ecpay_order_create_with_quota($1,$2,$3,$4)', [userId,'month',number,merchant]);
  if (lifetime) {
    await owner(db);
    await db.exec(`update public.members set is_lifetime=true where id='${memberId}'`);
    await service(db);
  }
  if (migration) {
    await owner(db);
    await db.exec(await readFile(reversalSync, 'utf8'));
    await service(db);
  }
  return db;
}

async function pay(db) {
  return (await db.query('select public.ecpay_paid_reconcile($1,$2,$3,$4,$5,$6,$7,$8,$9) as result', evidence)).rows[0].result;
}

for (const reversal of ['refunded', 'chargeback', 'cancelled']) {
  test(`admin ${reversal} synchronizes the linked ECPay order and preserves paid evidence`, async () => {
    const db = await ready();
    try {
      assert.equal((await pay(db)).status, 'confirmed');
      const { rows: [before] } = await db.query('select id from public.payments');
      const { rows: [result] } = await db.query(
        'select public.admin_record_payment_reversal($1,$2,$3,$4,$5) as result',
        [before.id,reversal,'外部已完成',actor,'超級管理員']);
      assert.equal(result.result.status,reversal);
      const { rows: [record] } = await db.query(`select o.status as order_status, p.status as payment_status,
        o.quota_state, o.quota_provider_status, o.trade_no, p.reversal_reason,
        m.current_plan_id, m.plan_expires_at from public.ecpay_orders o
        join public.payments p on p.ecpay_order_id=o.id
        join public.members m on m.id=o.member_id`);
      assert.equal(record.order_status,reversal);
      assert.equal(record.payment_status,reversal);
      assert.equal(record.quota_state,'occupied');
      assert.equal(record.quota_provider_status,'1');
      assert.equal(record.trade_no,tradeNo);
      assert.equal(record.reversal_reason,'外部已完成');
      assert.equal(record.current_plan_id,null);
      assert.equal(record.plan_expires_at,null);

      assert.equal((await pay(db)).status,reversal);
      assert.equal((await db.query('select public.ecpay_payment_confirm($1,$2,$3,$4)', [number,merchant,tradeNo,2880])).rows[0].ecpay_payment_confirm.status,reversal);
      await assert.rejects(
        db.query('select public.ecpay_payment_confirm($1,$2,$3,$4,$5)', [number,merchant,'DIFFERENT123',2880,paidAt]),
        /PAYMENT_CONFLICT/);
      assert.equal((await db.query('select count(*)::integer as count from public.payments')).rows[0].count,1);
    } finally { await db.close(); }
  });
}

test('a refund-required payment can be reversed without granting a membership', async () => {
  const db = await ready({ lifetime: true });
  try {
    assert.equal((await pay(db)).status,'refund_required');
    const { rows: [payment] } = await db.query('select id from public.payments');
    await db.query('select public.admin_record_payment_reversal($1,$2,$3,$4,$5)',
      [payment.id,'refunded','退款完成',actor,'超級管理員']);
    const { rows: [state] } = await db.query(`select o.status as order_status,
      p.status as payment_status, m.is_lifetime, m.current_plan_id from public.ecpay_orders o
      join public.payments p on p.ecpay_order_id=o.id join public.members m on m.id=o.member_id`);
    assert.deepEqual(state,{order_status:'refunded',payment_status:'refunded',is_lifetime:true,current_plan_id:null});
    assert.equal((await pay(db)).status,'refunded');
  } finally { await db.close(); }
});

test('migration synchronizes a historical reversal without changing its recorded quota', async () => {
  const db = await ready({ migration: false, lifetime: true });
  try {
    await pay(db);
    await db.query("update public.payments set status='refunded' where ecpay_order_id is not null");
    await owner(db);
    await db.exec(await readFile(reversalSync,'utf8'));
    const { rows: [state] } = await db.query(`select o.status as order_status, p.status as payment_status,
      o.quota_state, o.trade_no from public.ecpay_orders o
      join public.payments p on p.ecpay_order_id=o.id`);
    assert.deepEqual(state,{order_status:'refunded',payment_status:'refunded',quota_state:'occupied',trade_no:tradeNo});
  } finally { await db.close(); }
});

test('a mismatched linked payment aborts reversal without changing entitlement or order', async () => {
  const db = await ready();
  try {
    await pay(db);
    const { rows: [before] } = await db.query('select id from public.payments');
    await db.query('update public.payments set amount=2881 where id=$1', [before.id]);
    await assert.rejects(
      db.query('select public.admin_record_payment_reversal($1,$2,$3,$4,$5)',
        [before.id,'refunded','退款完成',actor,'超級管理員']),
      /PAYMENT_ORDER_MISMATCH/);
    const { rows: [state] } = await db.query(`select o.status as order_status,
      p.status as payment_status, m.current_plan_id from public.ecpay_orders o
      join public.payments p on p.ecpay_order_id=o.id join public.members m on m.id=o.member_id`);
    assert.equal(state.order_status,'confirmed');
    assert.equal(state.payment_status,'confirmed');
    assert.ok(state.current_plan_id);
  } finally { await db.close(); }
});
