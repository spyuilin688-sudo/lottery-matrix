import { createEcpayCheckMacValue, verifyEcpayCheckMacValue } from './ecpay.ts';

export type QuotaOrder = { merchantId: string; merchantTradeNo: string; amount: number;
  quotaState?: string; quotaPaymentType?: string | null; quotaProviderStatus?: string | null;
  quotaTradeNo?: string | null;
};
export type QuotaEvidence = QuotaOrder & {
  state: 'reserved' | 'occupied' | 'released';
  paymentType: string; providerStatus: string; occurredAt: string | null;
  paidAt: string | null; tradeNo: string;
};
type Config = { merchantId: string; hashKey: string; hashIv: string; environment: 'stage' | 'production' };

function tradeDate(value: string) {
  if (!/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) throw new Error('INVALID_PROVIDER_DATE');
  const iso = value.replaceAll('/', '-').replace(' ', 'T');
  const date = new Date(iso + '+08:00');
  if (!Number.isFinite(date.getTime())
    || new Date(date.getTime() + 8 * 3600000).toISOString().slice(0,19) !== iso) throw new Error('INVALID_PROVIDER_DATE');
  return date.toISOString();
}

/** Only use after verifying the provider's MAC and matching the local order. */
export function quotaEvidence(fields: Record<string,string>): QuotaEvidence {
  const status = fields.TradeStatus;
  const paymentType = fields.PaymentType ?? '';
  const offline = /^(ATM|CVS|BARCODE|WebATM)_[A-Za-z0-9]+$/.test(paymentType);
  const credit = /^(Credit|ApplePay)_[A-Za-z0-9]+$/.test(paymentType) || paymentType === 'Flexible_Installment';
  // These gateway receipts are settled by ECPay's partners, not its 30-day quota.
  // Other/new methods stay unresolved until their accounting rules are verified.
  const excludedGateway = ['TWQR_OPAY', 'BNPL_URICH', 'WeiXin_OPAY'].includes(paymentType);
  let state: QuotaEvidence['state'];
  if (status === '10200095') state = 'released';
  else if (status === '1' && excludedGateway) state = 'released';
  else if (status === '1' && (credit || offline)) state = 'occupied';
  else if (status === '0' && offline) state = 'occupied';
  else if (status === '0' || status === '1') state = 'reserved';
  else throw new Error('UNKNOWN_PROVIDER_STATUS');
  const amount = Number(fields.TradeAmt);
  if (!Number.isSafeInteger(amount) || amount <= 0
    || !/^[A-Za-z0-9]{1,20}$/.test(fields.MerchantTradeNo ?? '')
    || !/^[0-9]{1,10}$/.test(fields.MerchantID ?? '')
    || (status !== '10200095' && !/^[A-Za-z0-9]{1,20}$/.test(fields.TradeNo ?? ''))) throw new Error('INVALID_PROVIDER_ORDER');
  return {
    merchantId: fields.MerchantID, merchantTradeNo: fields.MerchantTradeNo, amount,
    state, paymentType, providerStatus: status, tradeNo: fields.TradeNo ?? '',
    // Offline numbers occupy quota when issued; credit occupies it on authorization.
    occurredAt: state === 'occupied'
      ? tradeDate(credit && status === '1' ? fields.PaymentDate ?? '' : fields.TradeDate ?? '')
      : null,
    paidAt: status === '1' ? tradeDate(fields.PaymentDate ?? '') : null,
  };
}

async function query(config: Config, order: QuotaOrder, path: string, fetcher: typeof fetch) {
  const values = { MerchantID: config.merchantId, MerchantTradeNo: order.merchantTradeNo, TimeStamp: String(Math.floor(Date.now()/1000)) };
  const CheckMacValue = await createEcpayCheckMacValue(values,config.hashKey,config.hashIv);
  const origin = config.environment === 'stage' ? 'https://payment-stage.ecpay.com.tw' : 'https://payment.ecpay.com.tw';
  const response = await fetcher(origin+path, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...values, CheckMacValue }).toString(), signal: AbortSignal.timeout(8000),
  });
  if (response.status === 403 || response.status === 429) throw new Error('ECPAY_QUERY_RATE_LIMITED');
  if (!response.ok) throw new Error('ECPAY_QUERY_FAILED');
  const text = await response.text();
  if (text.length > 16000) throw new Error('INVALID_PROVIDER_RESPONSE');
  const fields: Record<string,string> = {};
  for (const [key,value] of new URLSearchParams(text)) {
    if (Object.hasOwn(fields,key)) throw new Error('INVALID_PROVIDER_RESPONSE');
    fields[key]=value;
  }
  if (fields.MerchantID !== config.merchantId || fields.MerchantID !== order.merchantId
    || fields.MerchantTradeNo !== order.merchantTradeNo || fields.TradeAmt !== String(order.amount)
    || !await verifyEcpayCheckMacValue(fields,fields.CheckMacValue ?? '',config.hashKey,config.hashIv)) {
    throw new Error('INVALID_PROVIDER_RESPONSE');
  }
  return fields;
}

export async function queryEcpayQuota(config: Config, order: QuotaOrder, fetcher: typeof fetch = fetch) {
  const fields = await query(config,order,'/Cashier/QueryTradeInfo/V5',fetcher);
  if (fields.SimulatePaid === '1') throw new Error('SIMULATED_PAYMENT');
  const previouslyIssued = order.quotaState === 'occupied' && order.quotaProviderStatus === '0';
  if (previouslyIssued && fields.TradeStatus === '0'
    && (order.quotaPaymentType !== fields.PaymentType || order.quotaTradeNo !== fields.TradeNo)) {
    throw new Error('UNVERIFIED_PAYMENT_NUMBER');
  }
  if (fields.TradeStatus === '0' && /^(ATM|CVS|BARCODE)_/.test(fields.PaymentType ?? '')) {
    if (!previouslyIssued) {
      const issued = await query(config,order,'/Cashier/QueryPaymentInfo',fetcher);
      if (issued.RtnCode !== '1' || issued.TradeNo !== fields.TradeNo
        || issued.PaymentType !== fields.PaymentType || issued.TradeDate !== fields.TradeDate) {
        throw new Error('UNVERIFIED_PAYMENT_NUMBER');
      }
    }
  }
  return quotaEvidence(fields);
}

export function paidRecordParams(evidence: QuotaEvidence) {
  if (evidence.providerStatus !== '1' || !evidence.paidAt) throw new Error('INVALID_PAID_EVIDENCE');
  return { ...quotaRecordParams(evidence), p_paid_at: evidence.paidAt };
}

export function quotaRecordParams(evidence: QuotaEvidence) {
  return {
    p_merchant_id: evidence.merchantId, p_merchant_trade_no: evidence.merchantTradeNo,
    p_amount: evidence.amount, p_state: evidence.state, p_payment_type: evidence.paymentType,
    p_provider_status: evidence.providerStatus, p_occurred_at: evidence.occurredAt, p_trade_no: evidence.tradeNo,
  };
}
