import { getSupabaseClient } from './lib/supabase';

async function rpc<T>(name: string, args?: Record<string, unknown>) {
  const client = getSupabaseClient();
  const { data, error } = args
    ? await client.rpc(name, args)
    : await client.rpc(name);
  if (error) throw error;
  return data as T;
}

export async function postMemberOnline(path: string, body: Record<string, unknown>) {
  if (path === '/api/member-online/start') {
    return rpc<Record<string, unknown>>('member_online_start');
  }
  if (path === '/api/member-online/end') {
    const sessionId = String(body.sessionId ?? '').trim();
    if (!sessionId) throw new Error('MEMBER_ONLINE_SESSION_REQUIRED');
    return rpc<Record<string, unknown>>('member_online_end', { p_session_id: sessionId });
  }
  throw new Error('MEMBER_ONLINE_ROUTE_UNSUPPORTED');
}
