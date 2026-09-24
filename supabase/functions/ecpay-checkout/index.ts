import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createEcpayCheckoutHandler } from './handler.ts';
import { createOrderWithQuota, reconcileQuotaBatch } from './quota.ts';
import { paidRecordParams, queryEcpayQuota, quotaRecordParams, type QuotaOrder } from '../_shared/ecpay-quota.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const environment = Deno.env.get('ECPAY_ENVIRONMENT');
const paymentMode = Deno.env.get('ECPAY_PAYMENT_MODE');
const merchantId = Deno.env.get('ECPAY_MERCHANT_ID') ?? '';
const hashKey = Deno.env.get('ECPAY_HASH_KEY') ?? '';
const hashIv = Deno.env.get('ECPAY_HASH_IV') ?? '';

const handler = createEcpayCheckoutHandler({
  config: {
    merchantId, hashKey, hashIv,
    supabaseUrl,
    clientBackUrl: Deno.env.get('ECPAY_CLIENT_BACK_URL') ?? '',
    environment: environment === 'stage' || environment === 'production' ? environment : 'invalid',
    paymentMode: paymentMode === undefined || paymentMode === 'manual'
      ? 'manual'
      : paymentMode === 'ecpay' ? 'ecpay' : 'invalid',
  },
  async getAuthenticatedMember(authorization) {
    if (!supabaseUrl || !anonKey) return null;
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser();
    return error ? null : data.user?.id ?? null;
  },
  async createOrder(planCode, memberId, merchantTradeNo) {
    if (!supabaseUrl || !serviceRoleKey) throw new Error('SERVER_CONFIG_MISSING');
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return createOrderWithQuota({ memberId,planCode,merchantTradeNo,merchantId }, {
      async create(input) {
        const { data,error } = await client.rpc('ecpay_order_create_with_quota', {
          p_auth_user_id: input.memberId, p_plan_code: input.planCode,
          p_merchant_trade_no: input.merchantTradeNo, p_merchant_id: input.merchantId,
        });
        if (error || !data) throw new Error(error?.message ?? 'ORDER_CREATE_FAILED');
        return data;
      },
      async reconcile() {
        if (environment !== 'stage' && environment !== 'production') throw new Error('SERVER_CONFIG_MISSING');
        const { data,error } = await client.rpc('ecpay_quota_reconcile_claim',{ p_merchant_id: merchantId });
        if (error || !Array.isArray(data) || data.length === 0) throw new Error('ECPAY_QUOTA_UNCERTAIN');
        const queryConfig = { merchantId,hashKey,hashIv,environment } as const;
        await reconcileQuotaBatch(data as QuotaOrder[], {
          query: order => queryEcpayQuota(queryConfig,order),
          async record(evidence) {
            const paid = evidence.providerStatus === '1';
            const { error: recordError } = await client.rpc(
              paid ? 'ecpay_paid_reconcile' : 'ecpay_quota_record',
              paid ? paidRecordParams(evidence) : quotaRecordParams(evidence)
            );
            if (recordError) throw new Error(paid ? 'PAYMENT_CONFIRM_FAILED' : 'QUOTA_RECORD_FAILED');
          },
          async backoff() {
            const { error: backoffError } = await client.rpc('ecpay_quota_query_backoff',{ p_merchant_id: merchantId });
            if (backoffError) throw new Error('QUOTA_BACKOFF_FAILED');
          },
        });
      },
    });
  },
});

Deno.serve(handler);
