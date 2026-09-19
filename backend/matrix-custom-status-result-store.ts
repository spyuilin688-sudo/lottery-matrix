import type { MatrixLottery } from './matrix-custom-status.ts';
import type { MatrixCustomStatusResult } from './matrix-custom-status-result.ts';

type SupabaseStoreConfig = { url: string; serviceRoleKey: string };
type StoredResult = {
  analysis_version?: unknown;
  draw_period?: unknown;
  config_key?: unknown;
  standard_payload?: unknown;
  composite_payload?: unknown;
};

function payload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('SUPABASE_CUSTOM_STATUS_RESULT_READ_FAILED');
  }
  return value as Record<string, unknown>;
}

async function json(response: Response, code: string) {
  if (!response.ok) throw new Error(code);
  if (response.status === 204) return null;
  const body = await response.text();
  if (!body.trim()) return null;
  return JSON.parse(body) as unknown;
}

export function createCustomStatusResultStore(
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
    return new URL('/rest/v1/matrix_custom_status_results', config.url);
  }

  return {
    async read(
      memberId: string,
      lottery: MatrixLottery,
      drawPeriod?: string,
    ): Promise<MatrixCustomStatusResult | null> {
      const path = await endpoint();
      path.searchParams.set(
        'select',
        'analysis_version,draw_period,config_key,standard_payload,composite_payload',
      );
      path.searchParams.set('member_id', `eq.${memberId}`);
      path.searchParams.set('lottery', `eq.${lottery}`);
      if (drawPeriod) path.searchParams.set('draw_period', `eq.${drawPeriod}`);
      path.searchParams.set('limit', '1');
      const rows = await request(
        path,
        { method: 'GET' },
        'SUPABASE_CUSTOM_STATUS_RESULT_READ_FAILED',
      ) as StoredResult[];
      if (!rows[0]) return null;
      const row = rows[0];
      const analysisVersion = String(row.analysis_version ?? '').trim();
      const resolvedPeriod = String(row.draw_period ?? '').trim();
      const configKey = String(row.config_key ?? '');
      if (!analysisVersion || !resolvedPeriod || !configKey) {
        throw new Error('SUPABASE_CUSTOM_STATUS_RESULT_READ_FAILED');
      }
      return {
        analysisVersion,
        drawPeriod: resolvedPeriod,
        configKey,
        standardPayload: payload(row.standard_payload),
        compositePayload: payload(row.composite_payload),
      };
    },

    async save(
      memberId: string,
      lottery: MatrixLottery,
      result: MatrixCustomStatusResult,
    ): Promise<void> {
      const config = await loadConfig();
      const path = new URL('/rest/v1/rpc/matrix_custom_status_publish', config.url);
      const published = await request(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_result: {
          member_id: memberId,
          lottery,
          analysis_version: result.analysisVersion,
          draw_period: result.drawPeriod,
          config_key: result.configKey,
          standard_payload: result.standardPayload,
          composite_payload: result.compositePayload,
          updated_at: now().toISOString(),
        }}),
      }, 'SUPABASE_CUSTOM_STATUS_RESULT_SAVE_FAILED');
      if (published !== true) throw new Error('CUSTOM_STATUS_SUPERSEDED');
    },

    async reset(memberId: string, lottery: MatrixLottery): Promise<void> {
      const config = await loadConfig();
      const path = new URL('/rest/v1/rpc/matrix_custom_status_clear_if_unconfigured', config.url);
      const cleared = await request(
        path,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_member: memberId, p_lottery: lottery }) },
        'SUPABASE_CUSTOM_STATUS_RESULT_RESET_FAILED',
      );
      if (cleared !== true) throw new Error('CUSTOM_STATUS_SUPERSEDED');
    },
  };
}
