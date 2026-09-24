import { getAlgorithmCacheScope } from './auth/algorithm-cache-scope';
import { getSupabaseClient } from './lib/supabase';
import type { ManualTransferPlanCode } from './member-api';

type CheckoutResult = 'submitted' | 'manual';
const checkoutUrls = new Set([
  'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
  'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5',
]);
const fieldNames = new Set([
  'MerchantID', 'MerchantTradeNo', 'MerchantTradeDate', 'PaymentType',
  'TotalAmount', 'TradeDesc', 'ItemName', 'ReturnURL', 'ClientBackURL',
  'ChoosePayment', 'EncryptType', 'CheckMacValue', 'PaymentInfoURL',
]);

/** Leave the member's browser in the same tab, as required by AioCheckOut/V5. */
export async function beginEcpayCheckout(planCode: ManualTransferPlanCode, options: { isCurrent?: () => boolean } = {}): Promise<CheckoutResult> {
  const scope = getAlgorithmCacheScope();
  const { data, error } = await getSupabaseClient().functions.invoke('ecpay-checkout', {
    body: { planCode, supportsPaymentInfo: true },
  });
  if (scope !== getAlgorithmCacheScope()) throw new Error('MEMBER_SESSION_CHANGED');
  if (error) {
    const context = 'context' in error ? error.context : null;
    if (context instanceof Response && context.status === 409) {
      const payload = await context.json().catch(() => null);
      if (scope !== getAlgorithmCacheScope()) throw new Error('MEMBER_SESSION_CHANGED');
      if (payload?.error === 'MANUAL_TRANSFER_MODE') {
        if (options.isCurrent?.() === false) throw new Error('CHECKOUT_PAGE_LEFT');
        return 'manual';
      }
    }
    throw new Error('ECPAY_CHECKOUT_FAILED');
  }
  if (!data || typeof data !== 'object' || !checkoutUrls.has(data.action)
    || !data.fields || typeof data.fields !== 'object'
    || !/^[0-9A-F]{64}$/.test(data.fields.CheckMacValue ?? '')
    || !Number.isSafeInteger(data.fields.TotalAmount) || data.fields.TotalAmount <= 0
    || Object.keys(data.fields).some((key) => !fieldNames.has(key))) {
    throw new Error('ECPAY_CHECKOUT_INVALID');
  }
  if (options.isCurrent?.() === false) throw new Error('CHECKOUT_PAGE_LEFT');
  const form = document.createElement('form');
  form.action = data.action;
  form.method = 'post';
  form.target = '_self';
  form.hidden = true;
  for (const [name, value] of Object.entries(data.fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value);
    form.append(input);
  }
  document.body.append(form);
  try {
    form.submit();
  } catch (error) {
    form.remove();
    throw error;
  }
  return 'submitted';
}
