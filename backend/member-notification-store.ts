import { normalizeMemberNotificationSettings, type MemberNotificationSettings } from './member-notification-settings';

type SupabaseStoreConfig = { url: string; serviceRoleKey: string };
type StoredSettings = { settings?: unknown };

async function readJson(response: Response, code: string) {
  if (!response.ok) throw new Error(code);
  if (response.status === 204) return null;
  return response.json() as Promise<unknown>;
}

export function createMemberNotificationStore(
  loadConfig: () => Promise<SupabaseStoreConfig> | SupabaseStoreConfig,
  fetcher: typeof fetch = fetch,
  now: () => Date = () => new Date(),
) {
  async function endpoint() {
    const config = await loadConfig();
    return { config, path: new URL('/rest/v1/notification_settings', config.url) };
  }

  async function request(path: URL, config: SupabaseStoreConfig, init: RequestInit, code: string) {
    return readJson(await fetcher(path, {
      ...init,
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        ...(init.headers ?? {}),
      },
    }), code);
  }

  return {
    async read(memberId: string): Promise<MemberNotificationSettings | null> {
      const { config, path } = await endpoint();
      path.searchParams.set('select', 'settings');
      path.searchParams.set('member_id', `eq.${memberId}`);
      path.searchParams.set('limit', '1');
      const rows = await request(path, config, { method: 'GET' }, 'SUPABASE_NOTIFICATION_SETTINGS_READ_FAILED') as StoredSettings[];
      if (!rows[0]) return null;
      return normalizeMemberNotificationSettings(rows[0].settings);
    },

    async save(memberId: string, value: MemberNotificationSettings): Promise<MemberNotificationSettings> {
      const settings = normalizeMemberNotificationSettings(value);
      const { config, path } = await endpoint();
      path.searchParams.set('on_conflict', 'member_id');
      const rows = await request(path, config, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify({ member_id: memberId, settings, updated_at: now().toISOString() }),
      }, 'SUPABASE_NOTIFICATION_SETTINGS_SAVE_FAILED') as StoredSettings[];
      return normalizeMemberNotificationSettings(rows[0]?.settings ?? settings);
    },
  };
}
