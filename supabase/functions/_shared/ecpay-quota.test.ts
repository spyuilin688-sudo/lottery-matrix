import { describe, expect, it } from 'vitest';
import { createEcpayCheckMacValue } from './ecpay.ts';
import { queryEcpayQuota, quotaEvidence } from './ecpay-quota.ts';

const config = { merchantId: '3002607', hashKey: 'pwFHCqoQZGmho4w6', hashIv: 'EkRm7iFT261dpevs', environment: 'stage' as const };
const order = { merchantId: config.merchantId, merchantTradeNo: 'M2609231030001234567', amount: 2880 };
const fields = {
  MerchantID: order.merchantId, MerchantTradeNo: order.merchantTradeNo,
  TradeNo: '2609231234567890', TradeAmt: '2880', TradeStatus: '1',
  PaymentType: 'Credit_CreditCard', TradeDate: '2026/09/23 23:59:00',
  PaymentDate: '2026/09/24 00:01:00',
};
async function response(overrides: Record<string, string> = {}) {
  const values = { ...fields, ...overrides };
  return new Response(new URLSearchParams({ ...values, CheckMacValue: await createEcpayCheckMacValue(values, config.hashKey, config.hashIv) }));
}

describe('verified ECPay quota evidence', () => {
  it.each([
    ['1', 'Credit_CreditCard', 'occupied'],
    ['0', 'Credit_CreditCard', 'reserved'],
    ['0', 'WebATM_TAISHIN', 'occupied'],
    ['1', 'Flexible_Installment', 'occupied'],
    ['1', 'TWQR_OPAY', 'released'],
    ['1', 'BNPL_URICH', 'released'],
    ['1', 'WeiXin_OPAY', 'released'],
    ['0', 'TWQR_OPAY', 'reserved'],
    ['1', 'NewMethod', 'reserved'],
    ['1', '', 'reserved'],
    ['0', 'NewMethod', 'reserved'],
    ['10200095', '', 'released'],
  ])('classifies status %s and method %s as %s', async (TradeStatus, PaymentType, state) => {
    const result = await queryEcpayQuota(config, order, async () => response({ TradeStatus, PaymentType }));
    expect(result.state).toBe(state);
    expect(result.amount).toBe(2880);
    expect(result.occurredAt).toBe(state === 'occupied'
      ? (TradeStatus === '0' ? '2026-09-23T15:59:00.000Z' : '2026-09-23T16:01:00.000Z')
      : null);
  });
  it('requires matching signed number-issuance evidence before counting an unpaid ATM order', async () => {
    const urls: string[] = [];
    const result = await queryEcpayQuota(config, order, async (url) => {
      urls.push(String(url));
      return response({ TradeStatus: '0', PaymentType: 'ATM_TAISHIN', RtnCode: '1', vAccount: '1234567890123456', BankCode: '812', ExpireDate: '2026/09/26' });
    });
    expect(result.state).toBe('occupied');
    expect(urls).toEqual([
      'https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5',
      'https://payment-stage.ecpay.com.tw/Cashier/QueryPaymentInfo',
    ]);
  });
  it('keeps a query failure or unrecognised status unresolved instead of freeing quota', async () => {
    for (const fetcher of [
      async () => new Response('not found'),
      async () => new Response('busy', { status: 403 }),
      async () => response({ TradeStatus: '99' }),
      async () => response({ TradeAmt: '1' }),
      async () => response({ MerchantID: '9999999' }),
      async () => response({ PaymentDate: '2026/02/30 10:30:00' }),
    ]) await expect(queryEcpayQuota(config, order, fetcher)).rejects.toThrow();
  });
  it('rejects forged or duplicated response fields', async () => {
    const body = await (await response()).text();
    for (const value of [body.replace('2880', '2881'), body + '&TradeStatus=1']) {
      await expect(queryEcpayQuota(config, order, async () => new Response(value))).rejects.toThrow();
    }
  });
  it('recognises signed ATM and CVS number notifications without treating them as payments', () => {
    expect(quotaEvidence({ ...fields, PaymentType: 'ATM_TAISHIN', TradeStatus: '0' }).state).toBe('occupied');
    expect(quotaEvidence({ ...fields, PaymentType: 'CVS_CVS', TradeStatus: '0' }).state).toBe('occupied');
  });
  it('counts paid credit at the payment date and issued offline orders at the trade date', async () => {
    const credit = await queryEcpayQuota(config, order, async () => response());
    expect(credit.occurredAt).toBe('2026-09-23T16:01:00.000Z');
    expect(credit.paidAt).toBe('2026-09-23T16:01:00.000Z');
    const offline = quotaEvidence({ ...fields, PaymentType: 'ATM_TAISHIN', TradeStatus: '0' });
    expect(offline.occurredAt).toBe('2026-09-23T15:59:00.000Z');
    expect(offline.paidAt).toBeNull();
    const laterPaid = quotaEvidence({ ...fields, PaymentType: 'ATM_TAISHIN' });
    expect(laterPaid.occurredAt).toBe('2026-09-23T15:59:00.000Z');
    expect(laterPaid.paidAt).toBe('2026-09-23T16:01:00.000Z');
    expect(() => quotaEvidence({ ...fields, PaymentDate: '2026/02/30 12:00:00' })).toThrow('INVALID_PROVIDER_DATE');
  });
  it('verifies a first offline issuance only once, then checks only payment status for known issuance', async () => {
    const urls: string[] = [];
    const knownOrder = { ...order, quotaState: 'occupied' as const, quotaProviderStatus: '0',
      quotaPaymentType: 'ATM_TAISHIN', quotaTradeNo: fields.TradeNo };
    const result = await queryEcpayQuota(config, knownOrder, async (url) => {
      urls.push(String(url));
      return response({ TradeStatus: '0', PaymentType: 'ATM_TAISHIN' });
    });
    expect(result.state).toBe('occupied');
    expect(urls).toEqual(['https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5']);
    const mismatchedUrls: string[] = [];
    await expect(queryEcpayQuota(config, knownOrder, async (url) => {
      mismatchedUrls.push(String(url));
      return response({ TradeStatus: '0', PaymentType: 'ATM_TAISHIN', TradeNo: 'DIFFERENT' });
    })).rejects.toThrow();
    expect(mismatchedUrls).toEqual(['https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5']);
  });
});
