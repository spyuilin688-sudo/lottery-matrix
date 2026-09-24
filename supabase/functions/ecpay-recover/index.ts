import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { queryEcpayQuota, quotaRecordParams, type QuotaOrder } from '../_shared/ecpay-quota.ts';
import { createEcpayRecoveryHandler } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const merchantId = Deno.env.get('ECPAY_MERCHANT_ID') ?? '';
const hashKey = Deno.env.get('ECPAY_HASH_KEY') ?? '';
const hashIv = Deno.env.get('ECPAY_HASH_IV') ?? '';
const environment = Deno.env.get('ECPAY_ENVIRONMENT');
const client = createClient(supabaseUrl || 'https://invalid.local', serviceRoleKey || 'missing', {
  auth: { persistSession: false, autoRefreshToken: false },
});

const handler = createEcpayRecoveryHandler({
  token: Deno.env.get('MATRIX_NOTIFICATION_DISPATCH_TOKEN') ?? '',
  async claim() {
    if (!supabaseUrl || !serviceRoleKey || !merchantId || !hashKey || !hashIv
      || (environment !== 'stage' && environment !== 'production')) throw new Error('SERVER_CONFIG_MISSING');
    const { data,error } = await client.rpc('ecpay_quota_reconcile_claim',{ p_merchant_id: merchantId });
    if (error || !Array.isArray(data)) throw new Error('ECPAY_CLAIM_FAILED');
    return data as QuotaOrder[];
  },
  query(order) {
    if (environment !== 'stage' && environment !== 'production') throw new Error('SERVER_CONFIG_MISSING');
    return queryEcpayQuota({ merchantId,hashKey,hashIv,environment },order);
  },
  async record(evidence) {
    const paid = evidence.providerStatus === '1';
    const { error } = await client.rpc(paid ? 'ecpay_paid_reconcile' : 'ecpay_quota_record',quotaRecordParams(evidence));
    if (error) throw new Error(paid ? 'PAYMENT_CONFIRM_FAILED' : 'QUOTA_RECORD_FAILED');
  },
  async backoff() {
    const { error } = await client.rpc('ecpay_quota_query_backoff',{ p_merchant_id: merchantId });
    if (error) throw new Error('QUOTA_BACKOFF_FAILED');
  },
});

Deno.serve(handler);
