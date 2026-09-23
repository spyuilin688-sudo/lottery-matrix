import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createEcpayCheckoutHandler } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const environment = Deno.env.get('ECPAY_ENVIRONMENT');
const paymentMode = Deno.env.get('ECPAY_PAYMENT_MODE');

const handler = createEcpayCheckoutHandler({
  config: {
    merchantId: Deno.env.get('ECPAY_MERCHANT_ID') ?? '',
    hashKey: Deno.env.get('ECPAY_HASH_KEY') ?? '',
    hashIv: Deno.env.get('ECPAY_HASH_IV') ?? '',
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
    const { data, error } = await client.rpc('ecpay_order_create', {
      p_auth_user_id: memberId,
      p_plan_code: planCode,
      p_merchant_trade_no: merchantTradeNo,
      p_merchant_id: Deno.env.get('ECPAY_MERCHANT_ID') ?? '',
    });
    if (error || !data) throw new Error('ORDER_CREATE_FAILED');
    return data;
  },
});

Deno.serve(handler);
