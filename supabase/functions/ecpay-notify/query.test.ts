import { describe, expect, it, vi } from 'vitest';
import { createEcpayCheckMacValue } from '../_shared/ecpay.ts';
import { queryEcpayPaid } from './query.ts';

const config = { merchantId: '3002607', hashKey: 'pwFHCqoQZGmho4w6', hashIv: 'EkRm7iFT261dpevs', environment: 'stage' as const };
const payment = { merchantId: config.merchantId, merchantTradeNo: 'M2609231030001234567', tradeNo: '2609231234567890', amount: 2880 };

async function fakeResponse(overrides: Record<string, string> = {}) {
  const fields = {
    MerchantID: payment.merchantId,
    MerchantTradeNo: payment.merchantTradeNo,
    TradeNo: payment.tradeNo,
    TradeAmt: String(payment.amount),
    TradeStatus: '1',
    PaymentType: 'Credit_CreditCard',
    TradeDate: '2026/09/23 23:59:00',
    PaymentDate: '2026/09/24 00:01:00',
    ...overrides,
  };
  const CheckMacValue = await createEcpayCheckMacValue(fields, config.hashKey, config.hashIv);
  return new Response(new URLSearchParams({ ...fields, CheckMacValue }).toString());
}

describe('Green World query before membership activation', () => {
  it('signs the official server query and accepts only a paid matching order', async () => {
    const fetcher = vi.fn().mockResolvedValue(await fakeResponse());
    expect(await queryEcpayPaid(config, payment, fetcher)).toMatchObject({
      state: 'occupied', paidAt: '2026-09-23T16:01:00.000Z',
      occurredAt: '2026-09-23T16:01:00.000Z',
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5');
    const request = new URLSearchParams(init.body);
    expect(request.get('MerchantTradeNo')).toBe(payment.merchantTradeNo);
    expect(await createEcpayCheckMacValue({
      MerchantID: request.get('MerchantID')!,
      MerchantTradeNo: request.get('MerchantTradeNo')!,
      TimeStamp: request.get('TimeStamp')!,
    }, config.hashKey, config.hashIv)).toBe(request.get('CheckMacValue'));
  });

  it('refuses an unpaid or differently priced result despite a valid signature', async () => {
    for (const result of [await fakeResponse({ TradeStatus: '0' }), await fakeResponse({ TradeAmt: '1' })]) {
      await expect(queryEcpayPaid(config, payment, vi.fn().mockResolvedValue(result))).rejects.toThrow();
    }
  });

  it('refuses an unsigned or forged provider response', async () => {
    const response = await fakeResponse();
    const forged = (await response.text()).replace('TradeAmt=2880', 'TradeAmt=1');
    await expect(queryEcpayPaid(config, payment, vi.fn().mockResolvedValue(new Response(forged)))).rejects.toThrow();
  });
  it('does not accept a simulated or undated payment as a real receipt', async () => {
    for (const invalid of [{ SimulatePaid: '1' }, { PaymentDate: '' }] as Record<string, string>[]) {
      await expect(queryEcpayPaid(config, payment, vi.fn().mockResolvedValue(await fakeResponse(invalid)))).rejects.toThrow();
    }
  });
});
