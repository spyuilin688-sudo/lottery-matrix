import type { MatrixLottery } from './matrix-algorithm';
import type { CustomStatus, CustomStatusConfig } from './matrix-custom-status';

type SupabaseStoreConfig = { url: string; serviceRoleKey: string };
type StoredConfig = { lottery?: unknown; status?: unknown; config?: unknown };

async function json(response: Response, code: string) {
  if (!response.ok) throw new Error(code);
  if (response.status === 204) return null;
  return response.json() as Promise<unknown>;
}

export function createCustomStatusStore(
  loadConfig: () => Promise<SupabaseStoreConfig> | SupabaseStoreConfig,
  fetcher: typeof fetch = fetch,
  now: () => Date = () => new Date(),
) {
  async function request(path: URL, init: RequestInit, errorCode: string) {
    const config = await loadConfig();
    return json(await fetcher(path, {
      ...init,
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        ...(init.headers ?? {}),
      },
    }), errorCode);
  }

  async function endpoint() {
    const config = await loadConfig();
    return new URL('/rest/v1/matrix_custom_status_configs', config.url);
  }

  return {
    async list(memberId: string): Promise<CustomStatusConfig[]> {
      const path = await endpoint();
      path.searchParams.set('select', 'lottery,status,config');
      path.searchParams.set('member_id', `eq.${memberId}`);
      path.searchParams.set('order', 'lottery.asc,status.asc');
      const rows = await request(path, { method: 'GET' }, 'SUPABASE_CUSTOM_STATUS_READ_FAILED') as StoredConfig[];
      return rows.map((row) => row.config as CustomStatusConfig);
    },

    async save(memberId: string, configValue: CustomStatusConfig): Promise<CustomStatusConfig> {
      const path = await endpoint();
      path.searchParams.set('on_conflict', 'member_id,lottery,status');
      const rows = await request(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify({
          member_id: memberId,
          lottery: configValue.lottery,
          status: configValue.status,
          config: configValue,
          updated_at: now().toISOString(),
        }),
      }, 'SUPABASE_CUSTOM_STATUS_SAVE_FAILED') as StoredConfig[];
      return (rows[0]?.config ?? configValue) as CustomStatusConfig;
    },

    async reset(memberId: string, lottery: MatrixLottery, status: CustomStatus): Promise<void> {
      const path = await endpoint();
      path.searchParams.set('member_id', `eq.${memberId}`);
      path.searchParams.set('lottery', `eq.${lottery}`);
      path.searchParams.set('status', `eq.${status}`);
      await request(path, { method: 'DELETE' }, 'SUPABASE_CUSTOM_STATUS_RESET_FAILED');
    },
  };
}
