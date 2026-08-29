type MatrixLottery = '今彩539' | '天天樂' | '六合彩' | '大樂透';

export type MatrixStatusSourcePayload = {
  analysisVersion?: unknown;
  drawPeriod?: unknown;
  explore?: unknown;
  tianyan?: unknown;
};

type Config = { url: string; serviceRoleKey: string };

export function createMatrixStatusSourceReader(
  loadConfig: () => Config,
  fetcher: typeof fetch = fetch,
) {
  return async (lottery: MatrixLottery, drawPeriod?: string) => {
    const config = loadConfig();
    const response = await fetcher(`${config.url}/rest/v1/rpc/matrix_status_sources_get`, {
      method: 'POST',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_request: { lottery, ...(drawPeriod ? { drawPeriod } : {}) } }),
    });
    if (!response.ok) {
      try {
        const payload = await response.json() as { message?: unknown };
        if (String(payload.message ?? '').includes('ANALYSIS_NOT_READY')) return null;
      } catch {
        // Keep provider details out of the public error response.
      }
      throw new Error('SUPABASE_ANALYSIS_READ_FAILED');
    }
    return response.json() as Promise<MatrixStatusSourcePayload>;
  };
}
