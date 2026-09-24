import { createEcpayCheckMacValue, verifyEcpayCheckMacValue } from '../_shared/ecpay.ts';
import { quotaEvidence } from '../_shared/ecpay-quota.ts';

type Config = { merchantId: string; hashKey: string; hashIv: string; environment: 'stage' | 'production' };
type PaidOrder = { merchantId: string; merchantTradeNo: string; tradeNo: string; amount: number };

export async function queryEcpayPaid(config: Config, order: PaidOrder, fetcher: typeof fetch = fetch) {
  const query = {
    MerchantID: config.merchantId,
    MerchantTradeNo: order.merchantTradeNo,
    TimeStamp: Math.floor(Date.now() / 1000),
  };
  const CheckMacValue = await createEcpayCheckMacValue(query, config.hashKey, config.hashIv);
  const endpoint = config.environment === 'stage'
    ? 'https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5'
    : 'https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5';
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...query, TimeStamp: String(query.TimeStamp), CheckMacValue }).toString(),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('ECPAY_QUERY_FAILED');
  const body = await response.text();
  if (body.length > 16000) throw new Error('ECPAY_QUERY_INVALID');
  const fields: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(body)) {
    if (Object.hasOwn(fields, key)) throw new Error('ECPAY_QUERY_INVALID');
    fields[key] = value;
  }
  if (fields.MerchantID !== config.merchantId
    || fields.MerchantID !== order.merchantId
    || fields.MerchantTradeNo !== order.merchantTradeNo
    || fields.TradeNo !== order.tradeNo
    || fields.TradeAmt !== String(order.amount)
    || !await verifyEcpayCheckMacValue(fields, fields.CheckMacValue ?? '', config.hashKey, config.hashIv)
    || fields.TradeStatus !== '1' || fields.SimulatePaid === '1') {
    throw new Error('ECPAY_QUERY_UNPAID_OR_MISMATCH');
  }
  return quotaEvidence(fields);
}
