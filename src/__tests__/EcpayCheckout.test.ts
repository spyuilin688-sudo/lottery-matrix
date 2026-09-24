// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
const scope = vi.hoisted(() => ({ current: 1 }));
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ functions: { invoke } }) }));
vi.mock('../auth/algorithm-cache-scope', () => ({ getAlgorithmCacheScope: () => scope.current }));

import { beginEcpayCheckout } from '../ecpay-checkout';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  invoke.mockReset();
  scope.current = 1;
});

describe('one-time ECPay browser redirect', () => {
  it('submits the exact signed fields to the approved stage checkout in the same tab', async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
      expect(this.method).toBe('post');
      expect(this.action).toBe('https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5');
      expect(this.target).toBe('_self');
      expect(new FormData(this).get('CheckMacValue')).toBe('A'.repeat(64));
      expect(new FormData(this).get('TotalAmount')).toBe('2880');
      expect(new FormData(this).get('PaymentInfoURL')).toBe('https://example.supabase.co/functions/v1/ecpay-notify');
    });
    invoke.mockResolvedValue({ data: {
      action: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
      fields: { MerchantID: '3002607', TotalAmount: 2880, PaymentInfoURL: 'https://example.supabase.co/functions/v1/ecpay-notify', CheckMacValue: 'A'.repeat(64) },
    }, error: null });
    expect(await beginEcpayCheckout('month')).toBe('submitted');
    expect(invoke).toHaveBeenCalledWith('ecpay-checkout', { body: { planCode: 'month', supportsPaymentInfo: true } });
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

  it('does not submit a signed form when the checkout page was left while awaiting the response', async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined);
    let resolveCheckout!: (value: unknown) => void;
    invoke.mockReturnValue(new Promise((resolve) => { resolveCheckout = resolve; }));
    let active = true;
    const checkout = beginEcpayCheckout('month', { isCurrent: () => active });
    active = false;
    resolveCheckout({ data: {
      action: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
      fields: { MerchantID: '3002607', TotalAmount: 2880, CheckMacValue: 'A'.repeat(64) },
    }, error: null });
    await expect(checkout).rejects.toThrow('CHECKOUT_PAGE_LEFT');
    expect(submit).not.toHaveBeenCalled();
  });

  it('does not accept a manual-mode response parsed after the member changes', async () => {
    let resolvePayload!: (value: { error: string }) => void;
    const payload = new Promise<{ error: string }>((resolve) => { resolvePayload = resolve; });
    const context = new Response(null, { status: 409 });
    const parse = vi.spyOn(context, 'json').mockReturnValue(payload);
    invoke.mockResolvedValue({ data: null, error: { context } });
    const checkout = beginEcpayCheckout('month');
    await vi.waitFor(() => expect(parse).toHaveBeenCalledOnce());
    scope.current = 2;
    resolvePayload({ error: 'MANUAL_TRANSFER_MODE' });
    await expect(checkout).rejects.toThrow('MEMBER_SESSION_CHANGED');
  });
});
