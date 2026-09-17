type MatrixLottery = '今彩539' | '天天樂' | '六合彩' | '大樂透';

export type MatrixStatusIdentityPayload = {
  analysisVersion?: unknown;
  drawPeriod?: unknown;
};

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

export function createMatrixStatusIdentityReader(
  loadConfig: () => Config,
  fetcher: typeof fetch = fetch,
) {
  return async (lottery: MatrixLottery, drawPeriod?: string) => {
    const config = loadConfig();
    const response = await fetcher(`${config.url}/rest/v1/rpc/matrix_status_identity_get`, {
      method: 'POST',
      headers: serviceHeaders(config.serviceRoleKey),
      body: JSON.stringify({ p_request: { lottery, ...(drawPeriod ? { drawPeriod } : {}) } }),
    });
    return readAnalysisResponse<MatrixStatusIdentityPayload>(
      response,
      'SUPABASE_ANALYSIS_READ_FAILED',
    );
  };
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
  return async (lottery: MatrixLottery, drawPeriod?: string) => {
    const config = loadConfig();
    const response = await fetcher(`${config.url}/rest/v1/rpc/matrix_status_compact_get`, {
      method: 'POST',
      headers: serviceHeaders(config.serviceRoleKey),
      body: JSON.stringify({ p_request: { lottery, ...(drawPeriod ? { drawPeriod } : {}) } }),
    });
    return readAnalysisResponse<MatrixStatusCompactPayload>(
      response,
      'SUPABASE_ANALYSIS_READ_FAILED',
    );
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
