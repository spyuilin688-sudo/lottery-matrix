import { verifyEcpayCheckMacValue } from '../_shared/ecpay.ts';

type NotificationConfig = { merchantId: string; hashKey: string; hashIv: string };
type PaidOrder = { merchantId: string; merchantTradeNo: string; tradeNo: string; amount: number };
type Dependencies = {
  config: NotificationConfig;
  alreadyRecorded(order: PaidOrder): Promise<boolean>;
  verifyPaid(order: PaidOrder): Promise<boolean>;
  recordPaid(order: PaidOrder): Promise<unknown>;
};

function plain(body: string, status: number) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function createEcpayNotifyHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return plain('INVALID_REQUEST', 405);
    if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
      return plain('INVALID_REQUEST', 415);
    }
    try {
      const body = await request.text();
      if (body.length > 16000) return plain('INVALID_REQUEST', 413);
      const form = new URLSearchParams(body);
      const fields: Record<string, string> = {};
      for (const [key, value] of form.entries()) {
        if (Object.hasOwn(fields, key)) return plain('INVALID_REQUEST', 400);
        fields[key] = value;
      }
      const supplied = fields.CheckMacValue ?? '';
      if (fields.MerchantID !== dependencies.config.merchantId
        || !await verifyEcpayCheckMacValue(fields, supplied, dependencies.config.hashKey, dependencies.config.hashIv)) {
        return plain('INVALID_NOTIFICATION', 400);
      }
      // Green World uses RtnCode=1 even for a simulated payment; it is never a real purchase.
      if (fields.SimulatePaid === '1' || fields.RtnCode !== '1') return plain('1|OK', 200);
      const amount = Number(fields.TradeAmt);
      if (!/^[A-Za-z0-9]{1,20}$/.test(fields.MerchantTradeNo ?? '')
        || !/^[A-Za-z0-9]{1,20}$/.test(fields.TradeNo ?? '')
        || !Number.isSafeInteger(amount) || amount <= 0) {
        return plain('INVALID_NOTIFICATION', 400);
      }
      const order = {
        merchantId: fields.MerchantID,
        merchantTradeNo: fields.MerchantTradeNo,
        tradeNo: fields.TradeNo,
        amount,
      };
      if (await dependencies.alreadyRecorded(order)) return plain('1|OK', 200);
      if (!await dependencies.verifyPaid(order)) return plain('RETRY', 503);
      await dependencies.recordPaid(order);
      return plain('1|OK', 200);
    } catch {
      return plain('RETRY', 503);
    }
  };
}
