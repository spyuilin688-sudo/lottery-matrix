import { describe, expect, it, vi } from 'vitest';
import { createEcpayCheckMacValue } from '../_shared/ecpay.ts';
import { createEcpayNotifyHandler, matchesRecordedPaidOrder } from './handler.ts';

const config = { merchantId: '3002607', hashKey: 'pwFHCqoQZGmho4w6', hashIv: 'EkRm7iFT261dpevs' };
const payment = {
  MerchantID: config.merchantId,
  MerchantTradeNo: 'M2609231030001234567',
  TradeNo: '2609231234567890',
  TradeAmt: '2880',
  RtnCode: '1',
  SimulatePaid: '0',
  PaymentType: 'Credit_CreditCard',
  TradeDate: '2026/09/23 10:30:00',
};
const verified = {
  merchantId: payment.MerchantID, merchantTradeNo: payment.MerchantTradeNo,
  tradeNo: payment.TradeNo, amount: 2880, state: 'occupied' as const,
  paymentType: 'Credit_CreditCard', providerStatus: '1',
  occurredAt: '2026-09-23T02:30:00.000Z', paidAt: '2026-09-23T02:30:00.000Z',
};

async function signedRequest(fields: Record<string, string> = payment) {
  const mac = await createEcpayCheckMacValue(fields, config.hashKey, config.hashIv);
  return new Request('https://example.supabase.co/functions/v1/ecpay-notify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...fields, CheckMacValue: mac }),
  });
}

describe('ECPay payment notification', () => {
  it('keeps unknown payment methods unresolved without blocking a verified paid membership', async () => {
    const recordPaid = vi.fn().mockResolvedValue(undefined);
    const recordQuota = vi.fn().mockResolvedValue(undefined);
    const handler = createEcpayNotifyHandler({ config, verifyPaid: async () => ({ ...verified, state: 'reserved',
      paymentType: 'NewMethod', occurredAt: null }), recordPaid, recordQuota });
    expect((await handler(await signedRequest({ ...payment, PaymentType: 'NewMethod' }))).status).toBe(200);
    expect(recordQuota).not.toHaveBeenCalled();
    expect(recordPaid).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ state: 'reserved', providerStatus: '1' }));
  });
  it('records verified paid quota and membership atomically and acknowledges repeated callbacks', async () => {
    const events: string[] = [];
    const handler = createEcpayNotifyHandler({
      config, verifyPaid: async () => { events.push('verified'); return verified; },
      recordQuota: async () => { throw new Error('paid receipt belongs in one transaction'); },
      recordPaid: async (value) => { expect(value.paidAt).toBe(verified.paidAt); events.push('quota+membership'); },
    });
    for (let i=0;i<2;i++) expect((await handler(await signedRequest())).status).toBe(200);
    expect(events).toEqual(['verified','quota+membership','verified','quota+membership']);
  });
  it('acknowledges an already-recorded matching payment without a second provider query or write', async () => {
    const alreadyRecorded = vi.fn().mockResolvedValue(true);
    const verifyPaid = vi.fn();
    const recordPaid = vi.fn();
    const handler = createEcpayNotifyHandler({ config, alreadyRecorded, verifyPaid, recordPaid });
    const response = await handler(await signedRequest());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('1|OK');
    expect(alreadyRecorded).toHaveBeenCalledOnce();
    expect(verifyPaid).not.toHaveBeenCalled();
    expect(recordPaid).not.toHaveBeenCalled();
  });
  it('skips provider verification only for the exact paid order and signed trade identity', () => {
    const order = { merchantId: payment.MerchantID, merchantTradeNo: payment.MerchantTradeNo,
      tradeNo: payment.TradeNo, amount: 2880 };
    const saved = { merchant_id: order.merchantId, amount: order.amount,
      trade_no: order.tradeNo, status: 'confirmed', quota_provider_status: '1' };
    expect(matchesRecordedPaidOrder(order, saved)).toBe(true);
    expect(matchesRecordedPaidOrder(order, { ...saved, status: 'refund_required' })).toBe(true);
    for (const unverified of [null,
      { ...saved, merchant_id: 'another-merchant' },
      { ...saved, amount: 2881 },
      { ...saved, trade_no: 'another-trade' },
      { ...saved, status: 'pending' },
      { ...saved, quota_provider_status: '0' },
    ]) expect(matchesRecordedPaidOrder(order, unverified)).toBe(false);
  });
  it('does not skip independent verification for an unrecorded payment', async () => {
    const alreadyRecorded = vi.fn().mockResolvedValue(false);
    const verifyPaid = vi.fn().mockResolvedValue(verified);
    const recordPaid = vi.fn().mockResolvedValue(undefined);
    const handler = createEcpayNotifyHandler({ config, alreadyRecorded, verifyPaid, recordPaid });
    expect((await handler(await signedRequest())).status).toBe(200);
    expect(alreadyRecorded).toHaveBeenCalledOnce();
    expect(verifyPaid).toHaveBeenCalledOnce();
    expect(recordPaid).toHaveBeenCalledOnce();
  });
  it('records issued ATM/CVS quota without activating a membership', async () => {
    const recorded: unknown[] = [];
    const handler = createEcpayNotifyHandler({
      config, recordQuota: async (value) => { recorded.push(value); },
      recordPaid: async () => { throw new Error('issuance is not paid'); },
      verifyPaid: async () => { throw new Error('issuance is not paid'); },
    });
    for (const [RtnCode, PaymentType] of [['2','ATM_TAISHIN'],['10100073','CVS_CVS']]) {
      const response = await handler(await signedRequest({ ...payment, RtnCode, PaymentType }));
      expect(response.status).toBe(200);
    }
    expect(recorded).toHaveLength(2);
    expect(recorded[0]).toMatchObject({ state: 'occupied', amount: 2880, paymentType: 'ATM_TAISHIN', providerStatus: '0' });
  });
  it('retries a failed quota write and ignores a simulated issuance', async () => {
    const handler = createEcpayNotifyHandler({
      config, recordQuota: async () => { throw new Error('write failed'); },
      recordPaid: async () => {}, verifyPaid: async () => verified,
    });
    expect((await handler(await signedRequest({ ...payment, RtnCode: '2', PaymentType: 'ATM_TAISHIN' }))).status).toBe(503);
    expect((await handler(await signedRequest({ ...payment, RtnCode: '2', PaymentType: 'ATM_TAISHIN', SimulatePaid: '1' }))).status).toBe(200);
  });
  it('rejects a successful-issuance code paired with the wrong payment method', async () => {
    const recorded: unknown[] = [];
    const handler = createEcpayNotifyHandler({
      config, recordQuota: async (value) => { recorded.push(value); },
      recordPaid: async () => {}, verifyPaid: async () => verified,
    });
    expect((await handler(await signedRequest({ ...payment, RtnCode: '2' }))).status).toBe(400);
    expect(recorded).toEqual([]);
  });
  it('acknowledges a signed real payment only after recording it', async () => {
    const recordPaid = vi.fn().mockResolvedValue(undefined);
    const verifyPaid = vi.fn().mockResolvedValue(verified);
    const handler = createEcpayNotifyHandler({ config, recordPaid, verifyPaid });
    const response = await handler(await signedRequest());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('1|OK');
    expect(recordPaid).toHaveBeenCalledExactlyOnceWith(verified);
    expect(verifyPaid).toHaveBeenCalledOnce();
  });

  it('acknowledges a fully recorded refund obligation, including a repeated provider notification', async () => {
    const recordPaid = vi.fn().mockResolvedValue({ status: 'refund_required' });
    const handler = createEcpayNotifyHandler({ config, recordPaid, verifyPaid: vi.fn().mockResolvedValue(verified) });
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await handler(await signedRequest());
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('1|OK');
    }
    expect(recordPaid).toHaveBeenCalledTimes(2);
  });

  it('does not record simulated or unsuccessful payment notifications', async () => {
    const recordPaid = vi.fn();
    const verifyPaid = vi.fn();
    const handler = createEcpayNotifyHandler({ config, recordPaid, verifyPaid });
    for (const fields of [
      { ...payment, SimulatePaid: '1' },
      { ...payment, RtnCode: '0' },
    ]) {
      expect(await (await handler(await signedRequest(fields))).text()).toBe('1|OK');
    }
    expect(recordPaid).not.toHaveBeenCalled();
    expect(verifyPaid).not.toHaveBeenCalled();
  });

  it('rejects forged, duplicate-field, or mismatched notifications without acknowledgement', async () => {
    const recordPaid = vi.fn();
    const handler = createEcpayNotifyHandler({ config, recordPaid, verifyPaid: vi.fn() });
    const forged = await signedRequest();
    const body = (await forged.text()).replace('TradeAmt=2880', 'TradeAmt=9999');
    expect((await handler(new Request(forged.url, { method: 'POST', headers: forged.headers, body }))).status).toBe(400);
    const duplicated = await signedRequest();
    const duplicateBody = `${await duplicated.text()}&RtnCode=1`;
    expect((await handler(new Request(duplicated.url, { method: 'POST', headers: duplicated.headers, body: duplicateBody }))).status).toBe(400);
    expect((await handler(await signedRequest({ ...payment, MerchantID: 'other' }))).status).toBe(400);
    expect(recordPaid).not.toHaveBeenCalled();
  });

  it('does not acknowledge a failed database update, allowing the notification to retry', async () => {
    const handler = createEcpayNotifyHandler({ config, recordPaid: vi.fn().mockRejectedValue(new Error('db unavailable')), verifyPaid: vi.fn().mockResolvedValue(verified) });
    expect((await handler(await signedRequest())).status).toBe(503);
  });

  it('does not activate or acknowledge when the provider query cannot verify paid status', async () => {
    const recordPaid = vi.fn();
    const handler = createEcpayNotifyHandler({ config, recordPaid, verifyPaid: vi.fn().mockResolvedValue(false) });
    expect((await handler(await signedRequest())).status).toBe(503);
    expect(recordPaid).not.toHaveBeenCalled();
  });
});
