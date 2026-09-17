import type { MatrixLottery } from './matrix-custom-status.ts';

type SupabaseConfig = { url: string; serviceRoleKey: string };

export function createMatrixStatusRecomputeClient(
  loadConfig: () => Promise<SupabaseConfig> | SupabaseConfig,
  fetcher: typeof fetch = fetch,
) {
  return async (memberId: string, lottery: MatrixLottery) => {
    const config = await loadConfig();
    const response = await fetcher(
      `${config.url.replace(/\/+$/, '')}/functions/v1/matrix-status`,
      {
        method: 'POST',
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'recompute', memberId, lottery }),
      },
    );
    if (!response.ok) throw new Error('SUPABASE_CUSTOM_STATUS_RECOMPUTE_FAILED');
    return response.json() as Promise<unknown>;
  };
}
