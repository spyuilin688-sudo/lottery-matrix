// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ functions: { invoke } }) }));
vi.mock('../auth/algorithm-cache-scope', () => ({ getAlgorithmCacheScope: () => 1 }));

import { beginEcpayCheckout } from '../ecpay-checkout';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  invoke.mockReset();
});

describe('one-time ECPay browser redirect', () => {
  it('submits the exact signed fields to the approved stage checkout in the same tab', async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
      expect(this.method).toBe('post');
      expect(this.action).toBe('https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5');
      expect(this.target).toBe('_self');
      expect(new FormData(this).get('CheckMacValue')).toBe('A'.repeat(64));
      expect(new FormData(this).get('TotalAmount')).toBe('2880');
    });
    invoke.mockResolvedValue({ data: {
      action: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
      fields: { MerchantID: '3002607', TotalAmount: 2880, CheckMacValue: 'A'.repeat(64) },
    }, error: null });
    expect(await beginEcpayCheckout('month')).toBe('submitted');
    expect(invoke).toHaveBeenCalledWith('ecpay-checkout', { body: { planCode: 'month' } });
    expect(submit).toHaveBeenCalledOnce();
  });

  it('uses the existing manual flow only for the explicit manual mode response', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { context: new Response(JSON.stringify({ error: 'MANUAL_TRANSFER_MODE' }), { status: 409 }) } });
    expect(await beginEcpayCheckout('month')).toBe('manual');
    invoke.mockResolvedValueOnce({ data: null, error: { context: new Response('unavailable', { status: 503 }) } });
    await expect(beginEcpayCheckout('month')).rejects.toThrow();
  });

  it('rejects a checkout URL other than the two official Green World endpoints', async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined);
    invoke.mockResolvedValue({ data: { action: 'https://other.example/collect', fields: { CheckMacValue: 'A'.repeat(64) } }, error: null });
    await expect(beginEcpayCheckout('month')).rejects.toThrow();
    expect(submit).not.toHaveBeenCalled();
  });
});
