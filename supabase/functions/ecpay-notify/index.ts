import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createEcpayNotifyHandler, matchesRecordedPaidOrder } from './handler.ts';
import { queryEcpayPaid } from './query.ts';
import { paidRecordParams, quotaRecordParams } from '../_shared/ecpay-quota.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const environment = Deno.env.get('ECPAY_ENVIRONMENT');
const config = {
  merchantId: Deno.env.get('ECPAY_MERCHANT_ID') ?? '',
  hashKey: Deno.env.get('ECPAY_HASH_KEY') ?? '',
  hashIv: Deno.env.get('ECPAY_HASH_IV') ?? '',
};
const client = createClient(supabaseUrl || 'https://invalid.local',serviceRoleKey || 'missing',{
  auth: { persistSession: false,autoRefreshToken: false },
});
const handler = createEcpayNotifyHandler({
  config,
  async alreadyRecorded(order) {
    if (!supabaseUrl || !serviceRoleKey) throw new Error('SERVER_CONFIG_MISSING');
    const { data,error } = await client.from('ecpay_orders')
      .select('merchant_id,amount,trade_no,status,quota_provider_status')
      .eq('merchant_trade_no',order.merchantTradeNo).maybeSingle();
    if (error) throw new Error('ORDER_LOOKUP_FAILED');
    return matchesRecordedPaidOrder(order, data);
  },
  async recordQuota(evidence) {
    if (!supabaseUrl || !serviceRoleKey) throw new Error('SERVER_CONFIG_MISSING');
    const { error } = await client.rpc('ecpay_quota_record',quotaRecordParams(evidence));
    if (error) throw new Error('QUOTA_RECORD_FAILED');
  },
  async verifyPaid(order) {
    if (environment !== 'stage' && environment !== 'production') throw new Error('SERVER_CONFIG_MISSING');
    return queryEcpayPaid({ ...config, environment }, order);
  },
  async recordPaid(evidence) {
    if (!supabaseUrl || !serviceRoleKey) throw new Error('SERVER_CONFIG_MISSING');
    const { error } = await client.rpc('ecpay_paid_reconcile',paidRecordParams(evidence));
    if (error) throw new Error('PAYMENT_CONFIRM_FAILED');
  },
});

Deno.serve(handler);
