import { createEcpayCheckMacValue, createMerchantTradeNo } from '../_shared/ecpay.ts';
import type { QuotaResult } from './quota.ts';

type CheckoutConfig = {
  merchantId: string;
  hashKey: string;
  hashIv: string;
  supabaseUrl: string;
  clientBackUrl: string;
  environment: 'stage' | 'production' | 'invalid';
  paymentMode: 'ecpay' | 'manual' | 'invalid';
};

type Dependencies = {
  config: CheckoutConfig;
  getAuthenticatedMember(authorization: string): Promise<string | null>;
  createOrder(planCode: string, memberId: string, merchantTradeNo: string): Promise<QuotaResult>;
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function taipeiTradeDate(date: Date) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

export function createEcpayCheckoutHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
    const { config } = dependencies;
    if (config.paymentMode === 'manual') return json({ error: 'MANUAL_TRANSFER_MODE' }, 409);
    if (config.paymentMode !== 'ecpay') return json({ error: 'PAYMENT_UNAVAILABLE' }, 503);
    if (config.environment !== 'stage' && config.environment !== 'production') {
      return json({ error: 'PAYMENT_UNAVAILABLE' }, 503);
    }
    if (!config.merchantId || !config.hashKey || !config.hashIv || !config.supabaseUrl || !config.clientBackUrl) {
      return json({ error: 'PAYMENT_UNAVAILABLE' }, 503);
    }
    const authorization = request.headers.get('Authorization') ?? '';
    if (!/^Bearer\s+\S+$/.test(authorization)) return json({ error: 'AUTH_REQUIRED' }, 401);
    let planCode: string;
    let supportsPaymentInfo = false;
    try {
      const body = await request.json();
      planCode = body?.planCode;
      supportsPaymentInfo = body?.supportsPaymentInfo === true;
    } catch {
      return json({ error: 'INVALID_REQUEST' }, 400);
    }
    if (!['month', 'quarter', 'year'].includes(planCode)) return json({ error: 'INVALID_PLAN' }, 400);
    try {
      const memberId = await dependencies.getAuthenticatedMember(authorization);
      if (!memberId) return json({ error: 'AUTH_REQUIRED' }, 401);
      const order = await dependencies.createOrder(planCode, memberId, createMerchantTradeNo());
      if ('manual' in order && order.manual === true) return json({ error: 'MANUAL_TRANSFER_MODE' }, 409);
      if (!('merchantTradeNo' in order)) throw new Error('INVALID_SERVER_ORDER');
      if (!/^[A-Za-z0-9]{1,20}$/.test(order.merchantTradeNo)
        || !Number.isSafeInteger(order.amount) || order.amount <= 0 || !order.planName) {
        throw new Error('INVALID_SERVER_ORDER');
      }
      const fields = {
        MerchantID: config.merchantId,
        MerchantTradeNo: order.merchantTradeNo,
        MerchantTradeDate: taipeiTradeDate(new Date()),
        PaymentType: 'aio',
        TotalAmount: order.amount,
        TradeDesc: 'Matrix Pro',
        ItemName: order.planName,
        ReturnURL: `${config.supabaseUrl.replace(/\/$/, '')}/functions/v1/ecpay-notify`,
        // Older cached clients reject unknown signed fields. Their orders are
        // still covered by reconciliation; newer clients also receive issuance callbacks.
        ...(supportsPaymentInfo ? { PaymentInfoURL: `${config.supabaseUrl.replace(/\/$/, '')}/functions/v1/ecpay-notify` } : {}),
        ClientBackURL: config.clientBackUrl,
        ChoosePayment: 'ALL',
        EncryptType: 1,
      };
      const CheckMacValue = await createEcpayCheckMacValue(fields, config.hashKey, config.hashIv);
      const action = config.environment === 'stage'
        ? 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5'
        : 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';
      return json({ action, fields: { ...fields, CheckMacValue } }, 200);
    } catch {
      return json({ error: 'PAYMENT_UNAVAILABLE' }, 503);
    }
  };
}
