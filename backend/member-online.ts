type Rpc = (name: string, body: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
type SupabaseConfig = { url: string; anonKey: string; serviceRoleKey: string };

export function createMemberOnlineRpc(
  loadConfig: () => Promise<SupabaseConfig> | SupabaseConfig,
  fetcher: typeof fetch = fetch,
): Rpc {
  return async (name, body) => {
    const config = await loadConfig();
    const response = await fetcher(`${config.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`MEMBER_ONLINE_RPC_FAILED:${response.status}`);
    return response.json() as Promise<Array<Record<string, unknown>>>;
  };
}

export function createMemberOnlineService(rpc: Rpc, now: () => Date = () => new Date()) {
  return {
    async start(memberId: string) {
      const rows = await rpc('record_member_online_start', {
        p_member_id: memberId,
        p_now: now().toISOString(),
      });
      const sessionId = String(rows[0]?.session_id ?? '');
      if (!sessionId) throw new Error('MEMBER_ONLINE_START_FAILED');
      return { sessionId };
    },
    async end(memberId: string, sessionId: string) {
      const rows = await rpc('record_member_online_end', {
        p_member_id: memberId,
        p_session_id: sessionId,
        p_now: now().toISOString(),
      });
      return { onlineSeconds: Number(rows[0]?.online_seconds ?? 0) };
    },
  };
}
