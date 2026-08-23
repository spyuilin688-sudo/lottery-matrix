export type MemberProfile = {
  lineUserId: string | null;
  planName: string | null;
  planExpiresAt: string | null;
  isLifetime: boolean;
};

type SupabaseStoreConfig = { url: string; serviceRoleKey: string };
type MemberProfileRow = {
  line_user_id?: unknown;
  plan_expires_at?: unknown;
  is_lifetime?: unknown;
  current_plan?: { name?: unknown } | null;
};

async function readJson(response: Response) {
  if (!response.ok) throw new Error('SUPABASE_MEMBER_PROFILE_READ_FAILED');
  return response.json() as Promise<unknown>;
}

export function createMemberProfileStore(
  loadConfig: () => Promise<SupabaseStoreConfig> | SupabaseStoreConfig,
  fetcher: typeof fetch = fetch,
) {
  return {
    async read(memberId: string): Promise<MemberProfile> {
      const config = await loadConfig();
      const path = new URL('/rest/v1/members', config.url);
      path.searchParams.set('select', 'line_user_id,plan_expires_at,is_lifetime,current_plan:plans!members_current_plan_id_fkey(name)');
      path.searchParams.set('id', `eq.${memberId}`);
      path.searchParams.set('limit', '1');
      const rows = await readJson(await fetcher(path, {
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
        },
      })) as MemberProfileRow[];
      const row = rows[0];
      if (!row) throw new Error('SUPABASE_MEMBER_PROFILE_NOT_FOUND');
      const lineUserId = String(row.line_user_id ?? '').trim();
      const planName = String(row.current_plan?.name ?? '').trim();
      const planExpiresAt = String(row.plan_expires_at ?? '').trim();
      return {
        lineUserId: lineUserId || null,
        planName: planName || null,
        planExpiresAt: planExpiresAt || null,
        isLifetime: row.is_lifetime === true,
      };
    },
  };
}
