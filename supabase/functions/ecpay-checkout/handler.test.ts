import { describe, expect, it, vi } from 'vitest';
import { verifyEcpayCheckMacValue } from '../_shared/ecpay.ts';
import { createEcpayCheckoutHandler } from './handler.ts';

const config = {
  merchantId: '3002607',
  hashKey: 'pwFHCqoQZGmho4w6',
  hashIv: 'EkRm7iFT261dpevs',
  supabaseUrl: 'https://example.supabase.co',
  clientBackUrl: 'https://matrixlottery.idv.tw/',
  environment: 'stage' as const,
  paymentMode: 'ecpay' as const,
};

function request(body: unknown, authorization = 'Bearer user-token') {
  return new Request('https://example.supabase.co/functions/v1/ecpay-checkout', {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('ECPay one-time checkout', () => {
  it('uses the server-owned plan amount and signs a stage checkout for the signed-in member', async () => {
    const createOrder = vi.fn().mockResolvedValue({
      merchantTradeNo: 'M2609231030001234567', planName: '月費方案', amount: 2880,
    });
    const handler = createEcpayCheckoutHandler({
      config,
      getAuthenticatedMember: vi.fn().mockResolvedValue('member-uuid'),
      createOrder,
    });
    const response = await handler(request({ planCode: 'month', amount: 1 }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.action).toBe('https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5');
    expect(body.fields.TotalAmount).toBe(2880);
    expect(body.fields.MerchantID).toBe(config.merchantId);
    expect(body.fields.ChoosePayment).toBe('ALL');
    expect(body.fields.ReturnURL).toBe('https://example.supabase.co/functions/v1/ecpay-notify');
    expect(body.fields.ClientBackURL).toBe(config.clientBackUrl);
    expect(await verifyEcpayCheckMacValue(body.fields, body.fields.CheckMacValue, config.hashKey, config.hashIv)).toBe(true);
    expect(createOrder).toHaveBeenCalledOnce();
    expect(createOrder.mock.calls[0][0]).toBe('month');
    expect(createOrder.mock.calls[0][1]).toBe('member-uuid');
  });

  it('does not create an order for a missing member or an unrecognized plan', async () => {
    const createOrder = vi.fn();
    const guest = createEcpayCheckoutHandler({ config, getAuthenticatedMember: vi.fn().mockResolvedValue(false), createOrder });
    expect((await guest(request({ planCode: 'month' }))).status).toBe(401);
    const member = createEcpayCheckoutHandler({ config, getAuthenticatedMember: vi.fn().mockResolvedValue('member-uuid'), createOrder });
    expect((await member(request({ planCode: 'lifetime' }))).status).toBe(400);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('selects the existing manual transfer flow when the operator switches payment mode', async () => {
    const createOrder = vi.fn();
    const handler = createEcpayCheckoutHandler({
      config: { ...config, paymentMode: 'manual' },
      getAuthenticatedMember: vi.fn(),
      createOrder,
    });
    const response = await handler(request({ planCode: 'month' }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'MANUAL_TRANSFER_MODE' });
    expect(createOrder).not.toHaveBeenCalled();
  });
});
