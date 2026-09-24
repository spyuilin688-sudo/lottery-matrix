type MatrixLottery = '今彩539' | '天天樂' | '六合彩' | '大樂透';
const publicLotteries: MatrixLottery[] = ['今彩539', '天天樂', '六合彩', '大樂透'];

export type MatrixPublicResultRevisions = Record<MatrixLottery, {
  drawRevision: string;
  generation: number;
  activeVersions: Record<string, unknown>;
}>;

export type MatrixStatusSourcePayload = {
  analysisVersion?: unknown;
  drawPeriod?: unknown;
  explore?: unknown;
  tianyan?: unknown;
};

export type MatrixStatusCompactPayload = {
  analysisVersion?: unknown;
  drawPeriod?: unknown;
  payload?: unknown;
};

export type MatrixStatusValidationSourcePayload = {
  itemId?: unknown;
  validation?: unknown;
};

type Config = { url: string; serviceRoleKey: string };

function serviceHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

async function readAnalysisResponse<T>(
  response: Response,
  errorCode: string,
): Promise<T | null> {
  if (!response.ok) {
    try {
      const payload = await response.json() as { message?: unknown };
      if (String(payload.message ?? '').includes('ANALYSIS_NOT_READY')) return null;
    } catch {
      // Keep provider details out of the public error response.
    }
    throw new Error(errorCode);
  }
  return response.json() as Promise<T>;
}

export function createMatrixStatusSourceReader(
  loadConfig: () => Config,
  fetcher: typeof fetch = fetch,
) {
  return async (lottery: MatrixLottery, drawPeriod?: string) => {
    const config = loadConfig();
    const response = await fetcher(`${config.url}/rest/v1/rpc/matrix_status_sources_get`, {
      method: 'POST',
      headers: serviceHeaders(config.serviceRoleKey),
      body: JSON.stringify({ p_request: { lottery, ...(drawPeriod ? { drawPeriod } : {}) } }),
    });
    return readAnalysisResponse<MatrixStatusSourcePayload>(
      response,
      'SUPABASE_ANALYSIS_READ_FAILED',
    );
  };
}

export function createMatrixStatusCompactReader(
  loadConfig: () => Config,
  fetcher: typeof fetch = fetch,
) {
  return async (lottery: MatrixLottery, drawPeriod?: string, summaryOnly = false) => {
    const config = loadConfig();
    const response = await fetcher(`${config.url}/rest/v1/rpc/matrix_status_compact_get`, {
      method: 'POST',
      headers: serviceHeaders(config.serviceRoleKey),
      body: JSON.stringify({ p_request: { lottery, ...(drawPeriod ? { drawPeriod } : {}), ...(summaryOnly ? { summaryOnly: true } : {}) } }),
    });
    return readAnalysisResponse<MatrixStatusCompactPayload>(
      response,
      'SUPABASE_ANALYSIS_READ_FAILED',
    );
  };
}

export function createMatrixPublicResultRevisionReader(
  loadConfig: () => Config,
  fetcher: typeof fetch = fetch,
) {
  return async (): Promise<MatrixPublicResultRevisions> => {
    const config = loadConfig();
    const response = await fetcher(`${config.url}/rest/v1/rpc/matrix_public_result_revision`, {
      method: 'POST', headers: serviceHeaders(config.serviceRoleKey), body: '{}',
    });
    if (!response.ok) throw new Error('SUPABASE_RESULT_REVISION_READ_FAILED');
    const revisions = await response.json() as Record<string, unknown>;
    if (!revisions || typeof revisions !== 'object' || Array.isArray(revisions)
      || Object.keys(revisions).length !== publicLotteries.length
      || publicLotteries.some((lottery) => {
        const item = revisions[lottery] as Record<string, unknown> | undefined;
        return !item || typeof item !== 'object' || Array.isArray(item)
          || typeof item.drawRevision !== 'string'
          || !Number.isSafeInteger(item.generation)
          || !item.activeVersions || typeof item.activeVersions !== 'object'
          || Array.isArray(item.activeVersions);
      })) throw new Error('SUPABASE_RESULT_REVISION_READ_FAILED');
    return revisions as MatrixPublicResultRevisions;
  };
}

export function createMatrixStatusValidationReader(
  loadConfig: () => Config,
  fetcher: typeof fetch = fetch,
) {
  return async (
    lottery: MatrixLottery,
    drawPeriod: string,
    analysisVersion: string,
    itemId: string,
  ) => {
    const config = loadConfig();
    const response = await fetcher(
      `${config.url}/rest/v1/rpc/matrix_status_validation_source_get`,
      {
        method: 'POST',
        headers: serviceHeaders(config.serviceRoleKey),
        body: JSON.stringify({
          p_request: { lottery, drawPeriod, analysisVersion, itemId },
        }),
      },
    );
    if (!response.ok) throw new Error('SUPABASE_VALIDATION_READ_FAILED');
    return response.json() as Promise<MatrixStatusValidationSourcePayload>;
  };
}


export function createMatrixStatusIdentityReader(loadConfig: () => Config, fetcher: typeof fetch = fetch) {
  return async (lottery: MatrixLottery, drawPeriod?: string) => {
    const config = loadConfig();
    const response = await fetcher(`${config.url}/rest/v1/rpc/matrix_status_identity_get`, {
      method: 'POST', headers: serviceHeaders(config.serviceRoleKey),
      body: JSON.stringify({ p_request: { lottery, ...(drawPeriod ? { drawPeriod } : {}) } }),
    });
    return readAnalysisResponse<{ analysisVersion: string; drawPeriod: string }>(response, 'SUPABASE_ANALYSIS_READ_FAILED');
  };
}


export function createMatrixStatusEntitlementReader(
  loadConfig: () => Config & { anonKey: string },
  fetcher: typeof fetch = fetch,
) {
  return async (authorization?: string) => {
    const config = loadConfig();
    const token = authorization?.replace(/^Bearer\s+/i, '').trim() || config.anonKey;
    const response = await fetcher(`${config.url}/rest/v1/rpc/matrix_status_entitlements`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (!response.ok) throw new Error('SUPABASE_ENTITLEMENTS_READ_FAILED');
    return response.json() as Promise<{
      canUseSeven: boolean;
      canUseThirteen: boolean;
      canUseFullRange: boolean;
      canUseTianyan: boolean;
      canUseTiangong: boolean;
      canViewFullStatus: boolean;
    }>;
  };
}
