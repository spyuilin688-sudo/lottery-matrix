import { getSupabaseClient } from './lib/supabase';
import { LOTTERY_API_BASE } from './lottery-api';

export type MatrixApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'ANALYSIS_NOT_READY'
  | 'ANALYSIS_VERSION_MISMATCH'
  | 'NON_JSON_RESPONSE'
  | 'NETWORK_ERROR'
  | 'API_ERROR';

export class MatrixApiError extends Error {
  code: MatrixApiErrorCode;
  status: number;

  constructor(code: MatrixApiErrorCode, status: number, message = code) {
    super(message);
    this.name = 'MatrixApiError';
    this.code = code;
    this.status = status;
  }
}

function codeForStatus(status: number): MatrixApiErrorCode {
  if (status === 401) return 'AUTH_REQUIRED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'ANALYSIS_NOT_READY';
  if (status === 409) return 'ANALYSIS_VERSION_MISMATCH';
  return 'API_ERROR';
}

export function createMatrixApiClient(
  getAccessToken: () => Promise<string | null>,
  fetcher: typeof fetch = fetch,
  baseUrl = LOTTERY_API_BASE,
) {
  return {
    async fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new MatrixApiError('AUTH_REQUIRED', 401);

      const headers = new Headers(init.headers);
      headers.set('Accept', 'application/json');
      headers.set('Authorization', `Bearer ${accessToken}`);
      const url = `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

      let response: Response;
      try {
        response = await fetcher(url, { ...init, headers });
      } catch {
        throw new MatrixApiError('NETWORK_ERROR', 0);
      }

      if (!response.ok) {
        throw new MatrixApiError(codeForStatus(response.status), response.status);
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new MatrixApiError('NON_JSON_RESPONSE', response.status);
      }
      return response.json() as Promise<T>;
    },
  };
}

const matrixClient = createMatrixApiClient(async () => {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
});

export function matrixApiFetch<T>(path: string, init?: RequestInit) {
  return matrixClient.fetchJson<T>(path, init);
}
