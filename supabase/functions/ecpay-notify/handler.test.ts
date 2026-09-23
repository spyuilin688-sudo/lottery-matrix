import { describe, expect, it, vi } from 'vitest';
import { createEcpayCheckMacValue } from '../_shared/ecpay.ts';
import { createEcpayNotifyHandler } from './handler.ts';

const config = { merchantId: '3002607', hashKey: 'pwFHCqoQZGmho4w6', hashIv: 'EkRm7iFT261dpevs' };
const payment = {
  MerchantID: config.merchantId,
  MerchantTradeNo: 'M2609231030001234567',
  TradeNo: '2609231234567890',
  TradeAmt: '2880',
  RtnCode: '1',
  SimulatePaid: '0',
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
  it('acknowledges a signed real payment only after recording it', async () => {
    const recordPaid = vi.fn().mockResolvedValue(undefined);
    const verifyPaid = vi.fn().mockResolvedValue(true);
    const handler = createEcpayNotifyHandler({ config, recordPaid, verifyPaid });
    const response = await handler(await signedRequest());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('1|OK');
    expect(recordPaid).toHaveBeenCalledExactlyOnceWith({
      merchantId: config.merchantId,
      merchantTradeNo: payment.MerchantTradeNo,
      tradeNo: payment.TradeNo,
      amount: 2880,
    });
    expect(verifyPaid).toHaveBeenCalledOnce();
  });

  it('acknowledges a fully recorded refund obligation, including a repeated provider notification', async () => {
    const recordPaid = vi.fn().mockResolvedValue({ status: 'refund_required' });
    const handler = createEcpayNotifyHandler({ config, recordPaid, verifyPaid: vi.fn().mockResolvedValue(true) });
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
    const handler = createEcpayNotifyHandler({ config, recordPaid: vi.fn().mockRejectedValue(new Error('db unavailable')), verifyPaid: vi.fn().mockResolvedValue(true) });
    expect((await handler(await signedRequest())).status).toBe(503);
  });

  it('does not activate or acknowledge when the provider query cannot verify paid status', async () => {
    const recordPaid = vi.fn();
    const handler = createEcpayNotifyHandler({ config, recordPaid, verifyPaid: vi.fn().mockResolvedValue(false) });
    expect((await handler(await signedRequest())).status).toBe(503);
    expect(recordPaid).not.toHaveBeenCalled();
  });
});
