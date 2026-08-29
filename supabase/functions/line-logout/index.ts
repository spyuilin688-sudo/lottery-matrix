import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createLineLogoutHandler } from './handler.ts';

const handler = createLineLogoutHandler({
  async getUser(authorization) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (!supabaseUrl || !anonKey) return null;
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser();
    return error ? null : data.user;
  },
  getLineConfig() {
    return {
      channelId: Deno.env.get('LINE_CHANNEL_ID') ?? '',
      channelSecret: Deno.env.get('LINE_CHANNEL_SECRET') ?? '',
    };
  },
});

Deno.serve(handler);
