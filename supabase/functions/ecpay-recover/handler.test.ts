import { describe, expect, it, vi } from 'vitest';
import { createEcpayRecoveryHandler } from './handler.ts';
import type { QuotaEvidence, QuotaOrder } from '../_shared/ecpay-quota.ts';
import { queryEcpayQuota } from '../_shared/ecpay-quota.ts';
import { createEcpayCheckMacValue } from '../_shared/ecpay.ts';

const order: QuotaOrder = { merchantId: '3002607', merchantTradeNo: 'M2609231030001234567', amount: 2880 };
const paid: QuotaEvidence = {
  ...order, state: 'occupied', paymentType: 'Credit_CreditCard', providerStatus: '1',
  occurredAt: '2026-09-23T02:30:00.000Z', tradeNo: '2609231234567890',
};
const request = (token?: string, method = 'POST') => new Request('https://example/functions/v1/ecpay-recover', {
  method, headers: token ? { 'x-matrix-dispatch-token': token } : {},
});

describe('scheduled ECPay payment recovery', () => {
  it('requires the server token before touching order data', async () => {
    const claim = vi.fn();
    const handler = createEcpayRecoveryHandler({ token: 'secret', claim, query: vi.fn(), record: vi.fn(), backoff: vi.fn() });
    expect((await handler(request())).status).toBe(401);
    expect((await handler(request('wrong'))).status).toBe(403);
    expect((await handler(request('secret', 'GET'))).status).toBe(405);
    expect(claim).not.toHaveBeenCalled();
  });

  it('records signed paid evidence in the database even when no callback was delivered', async () => {
    const query = vi.fn().mockResolvedValue(paid);
    const record = vi.fn().mockResolvedValue(undefined);
    const handler = createEcpayRecoveryHandler({
      token: 'secret', claim: async () => [order], query, record, backoff: vi.fn(),
    });
    expect((await handler(request('secret'))).status).toBe(200);
    expect(query).toHaveBeenCalledExactlyOnceWith(order);
    expect(record).toHaveBeenCalledExactlyOnceWith(paid);
  });

  it('never grants an issued but unpaid order and backs off all provider queries on 403', async () => {
    const issued: QuotaEvidence = { ...paid, paymentType: 'ATM_TAISHIN', providerStatus: '0' };
    const record = vi.fn();
    const handler = createEcpayRecoveryHandler({ token: 'secret', claim: async () => [order],
      query: async () => issued, record, backoff: vi.fn() });
    expect((await handler(request('secret'))).status).toBe(200);
    expect(record).toHaveBeenCalledExactlyOnceWith(issued);

    const backoff = vi.fn();
    const query = vi.fn().mockRejectedValue(new Error('ECPAY_QUERY_RATE_LIMITED'));
    const throttled = createEcpayRecoveryHandler({ token: 'secret', claim: async () => [order, order],
      query, record, backoff });
    expect((await throttled(request('secret'))).status).toBe(503);
    expect(query).toHaveBeenCalledTimes(1);
    expect(backoff).toHaveBeenCalledOnce();
  });

  it('ignores an unsigned paid claim or a signed response for a different amount', async () => {
    const config = { merchantId: order.merchantId, hashKey: 'test-key', hashIv: 'test-iv', environment: 'stage' as const };
    const fields = {
      MerchantID: order.merchantId, MerchantTradeNo: order.merchantTradeNo, TradeNo: paid.tradeNo,
      TradeAmt: String(order.amount), TradeStatus: '1', PaymentType: paid.paymentType,
      TradeDate: '2026/09/23 10:30:00',
    };
    const record = vi.fn();
    for (const supplied of [
      { ...fields, CheckMacValue: '0'.repeat(64) },
      { ...fields, TradeAmt: '1', CheckMacValue: await createEcpayCheckMacValue({ ...fields, TradeAmt: '1' },config.hashKey,config.hashIv) },
    ]) {
      const handler = createEcpayRecoveryHandler({ token: 'secret', claim: async () => [order],
        query: value => queryEcpayQuota(config,value,async () => new Response(new URLSearchParams(supplied))),
        record, backoff: vi.fn() });
      expect((await handler(request('secret'))).status).toBe(503);
    }
    expect(record).not.toHaveBeenCalled();
  });
});
