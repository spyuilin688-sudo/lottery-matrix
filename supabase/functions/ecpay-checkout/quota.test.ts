import { describe, expect, it } from 'vitest';
import { createOrderWithQuota, reconcileQuotaBatch } from './quota.ts';
import type { QuotaEvidence } from '../_shared/ecpay-quota.ts';
import { createEcpayCheckoutHandler } from './handler.ts';

const order = { merchantTradeNo: 'M2609240000001234567', amount: 2880, planName: '月費方案' };
const input = { memberId: 'member', planCode: 'month', merchantTradeNo: order.merchantTradeNo, merchantId: '3002607' };
const config = { merchantId: '3002607', hashKey: 'test-key', hashIv: 'test-iv', supabaseUrl: 'https://example.supabase.co', clientBackUrl: 'https://matrixlottery.idv.tw/', environment: 'stage' as const, paymentMode: 'ecpay' as const };
const request = () => new Request('https://example/checkout', { method: 'POST', headers: { Authorization: 'Bearer member' }, body: JSON.stringify({ planCode: 'month' }) });

describe('quota checkout decisions', () => {
  it('persists later valid evidence after one order query fails and keeps the result uncertain', async () => {
    const queried: string[] = [];
    const recorded: string[] = [];
    const orders = ['BAD', 'GOOD'].map(merchantTradeNo => ({ merchantId: '3002607', merchantTradeNo, amount: 2880 }));
    await expect(reconcileQuotaBatch(orders, {
      query: async value => {
        queried.push(value.merchantTradeNo);
        if (value.merchantTradeNo === 'BAD') throw new Error('ECPAY_QUERY_FAILED');
        return { ...value, state: 'released', paymentType: '', providerStatus: '10200095', occurredAt: null, tradeNo: '' } as QuotaEvidence;
      },
      record: async value => { recorded.push(value.merchantTradeNo); },
      backoff: async () => { throw new Error('must not back off ordinary errors'); },
    })).rejects.toThrow('ECPAY_QUERY_FAILED');
    expect(queried).toEqual(['BAD', 'GOOD']);
    expect(recorded).toEqual(['GOOD']);
  });
  it('stops the batch and backs off immediately when ECPay rate limits a query', async () => {
    const events: string[] = [];
    const orders = ['FIRST', 'SECOND'].map(merchantTradeNo => ({ merchantId: '3002607', merchantTradeNo, amount: 2880 }));
    await expect(reconcileQuotaBatch(orders, {
      query: async value => { events.push(value.merchantTradeNo); throw new Error('ECPAY_QUERY_RATE_LIMITED'); },
      record: async () => { throw new Error('must not record'); },
      backoff: async () => { events.push('backoff'); },
    })).rejects.toThrow('ECPAY_QUERY_RATE_LIMITED');
    expect(events).toEqual(['FIRST', 'backoff']);
  });
  it('returns the existing manual response only for confirmed insufficient quota', async () => {
    const result = await createOrderWithQuota(input, {
      create: async () => { throw new Error('ECPAY_QUOTA_LIMIT'); },
      reconcile: async () => { throw new Error('must not query'); },
    });
    const handler = createEcpayCheckoutHandler({ config, getAuthenticatedMember: async () => 'member', createOrder: async () => result });
    const response = await handler(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'MANUAL_TRANSFER_MODE' });
  });
  it('rechecks after provider reconciliation and resumes ECPay when sufficient', async () => {
    let reconciled = false;
    const result = await createOrderWithQuota(input, {
      create: async () => { if (!reconciled) throw new Error('ECPAY_QUOTA_UNCERTAIN'); return order; },
      reconcile: async () => { reconciled = true; },
    });
    expect(result).toEqual(order);
  });
  it('never converts a failed query or unresolved reservation into manual transfer or a signed form', async () => {
    for (const reconcile of [async () => {}, async () => { throw new Error('ECPAY_QUERY_FAILED'); }]) {
      const handler = createEcpayCheckoutHandler({
        config, getAuthenticatedMember: async () => 'member',
        createOrder: () => createOrderWithQuota(input, { create: async () => { throw new Error('ECPAY_QUOTA_UNCERTAIN'); }, reconcile }),
      });
      const response = await handler(request());
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'PAYMENT_UNAVAILABLE' });
    }
  });
  it('does not reconcile authorization or database errors', async () => {
    await expect(createOrderWithQuota(input, {
      create: async () => { throw new Error('FORBIDDEN'); },
      reconcile: async () => { throw new Error('wrong branch'); },
    })).rejects.toThrow('FORBIDDEN');
  });
});
