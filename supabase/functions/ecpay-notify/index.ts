import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createEcpayNotifyHandler } from './handler.ts';
import { queryEcpayPaid } from './query.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const environment = Deno.env.get('ECPAY_ENVIRONMENT');
const config = {
  merchantId: Deno.env.get('ECPAY_MERCHANT_ID') ?? '',
  hashKey: Deno.env.get('ECPAY_HASH_KEY') ?? '',
  hashIv: Deno.env.get('ECPAY_HASH_IV') ?? '',
};
const handler = createEcpayNotifyHandler({
  config,
  async verifyPaid(order) {
    if (environment !== 'stage' && environment !== 'production') throw new Error('SERVER_CONFIG_MISSING');
    return queryEcpayPaid({ ...config, environment }, order);
  },
  async recordPaid(order) {
    if (!supabaseUrl || !serviceRoleKey) throw new Error('SERVER_CONFIG_MISSING');
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.rpc('ecpay_payment_confirm', {
      p_merchant_trade_no: order.merchantTradeNo,
      p_merchant_id: order.merchantId,
      p_trade_no: order.tradeNo,
      p_amount: order.amount,
    });
    if (error) throw new Error('PAYMENT_CONFIRM_FAILED');
  },
});

Deno.serve(handler);
