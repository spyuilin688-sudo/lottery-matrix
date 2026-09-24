import { verifyEcpayCheckMacValue } from '../_shared/ecpay.ts';
import { quotaEvidence, type QuotaEvidence } from '../_shared/ecpay-quota.ts';

type NotificationConfig = { merchantId: string; hashKey: string; hashIv: string };
type PaidOrder = { merchantId: string; merchantTradeNo: string; tradeNo: string; amount: number };
type RecordedOrder = { merchant_id: string; amount: number; trade_no: string | null;
  status: string; quota_provider_status: string | null };

export function matchesRecordedPaidOrder(order: PaidOrder, saved: RecordedOrder | null): boolean {
  return saved?.merchant_id === order.merchantId && saved.amount === order.amount
    && saved.trade_no === order.tradeNo && saved.quota_provider_status === '1'
    && (saved.status === 'confirmed' || saved.status === 'refund_required');
}

type Dependencies = {
  config: NotificationConfig;
  alreadyRecorded?(order: PaidOrder): Promise<boolean>;
  verifyPaid(order: PaidOrder): Promise<QuotaEvidence | false>;
  recordPaid(evidence: QuotaEvidence): Promise<unknown>;
  recordQuota?(evidence: QuotaEvidence): Promise<unknown>;
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
      if (fields.SimulatePaid === '1') return plain('1|OK', 200);
      const issued = fields.RtnCode === '2' || fields.RtnCode === '10100073';
      if (fields.RtnCode !== '1' && !issued) return plain('1|OK', 200);
      if (issued && !(
        (fields.RtnCode === '2' && /^ATM_/.test(fields.PaymentType ?? ''))
        || (fields.RtnCode === '10100073' && /^(CVS|BARCODE)_/.test(fields.PaymentType ?? ''))
      )) return plain('INVALID_NOTIFICATION',400);
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
      if (issued) {
        if (!dependencies.recordQuota) return plain('RETRY',503);
        await dependencies.recordQuota(quotaEvidence({ ...fields, TradeStatus: '0' }));
        return plain('1|OK',200);
      }
      if (await dependencies.alreadyRecorded?.(order)) return plain('1|OK', 200);
      const verified = await dependencies.verifyPaid(order);
      if (!verified) return plain('RETRY', 503);
      // The paid evidence and membership grant share one database transaction.
      await dependencies.recordPaid(verified);
      return plain('1|OK', 200);
    } catch {
      return plain('RETRY', 503);
    }
  };
}
