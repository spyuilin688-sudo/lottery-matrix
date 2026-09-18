import { getSupabaseClient } from './lib/supabase';
import {
  ApiRequestError,
  fetchWithPolicy,
  isRetryableStatus,
  isSafeReadMethod,
  withDeadline,
  withRequestId,
} from './lib/api-resilience';
import { RAILWAY_API_BASE } from './runtime-api-config';

export type MatrixApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'LINE_PROVIDER_TOKEN_REQUIRED'
  | 'LINE_IDENTITY_REQUIRED'
  | 'LINE_IDENTITY_CONFLICT'
  | 'LINE_LOGIN_NOT_CONFIGURED'
  | 'LINE_PROVIDER_REQUEST_FAILED'
  | 'MEMBER_BOOTSTRAP_FAILED'
  | 'FORBIDDEN'
  | 'ANALYSIS_NOT_READY'
  | 'ANALYSIS_VERSION_MISMATCH'
  | 'NON_JSON_RESPONSE'
  | 'REQUEST_TIMEOUT'
  | 'REQUEST_ABORTED'
  | 'NETWORK_ERROR'
  | 'API_ERROR';

const RAILWAY_MATRIX_API_BASE = RAILWAY_API_BASE;

const REMOTE_ERROR_STATUS = {
  AUTH_REQUIRED: 401,
  LINE_PROVIDER_TOKEN_REQUIRED: 400,
  LINE_IDENTITY_REQUIRED: 403,
  LINE_IDENTITY_CONFLICT: 409,
  LINE_LOGIN_NOT_CONFIGURED: 503,
  LINE_PROVIDER_REQUEST_FAILED: 502,
  MEMBER_BOOTSTRAP_FAILED: 502,
} as const;

export class MatrixApiError extends Error {
  code: MatrixApiErrorCode;
  status: number;
  requestId: string | undefined;
  retryable: boolean;

  constructor(
    code: MatrixApiErrorCode,
    status: number,
    message = code,
    options: { requestId?: string; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'MatrixApiError';
    this.code = code;
    this.status = status;
    this.requestId = options.requestId;
    this.retryable = options.retryable ?? false;
  }
}

function codeForStatus(status: number): MatrixApiErrorCode {
  if (status === 401) return 'AUTH_REQUIRED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'ANALYSIS_NOT_READY';
  if (status === 409) return 'ANALYSIS_VERSION_MISMATCH';
  return 'API_ERROR';
}

function isRecognizedApiErrorCode(code: unknown, status: number): code is keyof typeof REMOTE_ERROR_STATUS {
  return typeof code === 'string'
    && Object.prototype.hasOwnProperty.call(REMOTE_ERROR_STATUS, code)
    && REMOTE_ERROR_STATUS[code as keyof typeof REMOTE_ERROR_STATUS] === status;
}

function errorCodeFromPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return undefined;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return undefined;
  return (error as { code?: unknown }).code;
}

function isJsonContentType(contentType: string): boolean {
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase();
  return mediaType === 'application/json'
    || /^application\/[!#$%&'*+\-.^_`|~0-9a-z]+\+json$/.test(mediaType);
}

export function createMatrixApiClient(
  getAccessToken: () => Promise<string | null>,
  fetcher: typeof fetch = fetch,
  baseUrl = RAILWAY_MATRIX_API_BASE,
) {
  return {
    async fetchJson<T>(
      path: string,
      init: RequestInit = {},
      options: { auth?: 'required' | 'optional' } = {},
    ): Promise<T> {
      const { headers, requestId } = withRequestId(init.headers);
      try {
        return await withDeadline(async (signal) => {
          const accessToken = await getAccessToken();
          if (!accessToken && options.auth !== 'optional') {
            throw new MatrixApiError('AUTH_REQUIRED', 401);
          }
          if (!baseUrl) throw new MatrixApiError('NETWORK_ERROR', 0);

          headers.set('Accept', 'application/json');
          if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
          const url = `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
          const response = await fetchWithPolicy(url, { ...init, headers, signal }, { fetcher });

          if (!response.ok) {
            let payload: unknown;
            const contentType = response.headers.get('content-type') ?? '';
            if (isJsonContentType(contentType)) {
              try {
                payload = await response.json();
              } catch {
                payload = undefined;
              }
            }
            const code = errorCodeFromPayload(payload);
            const remoteCode = isRecognizedApiErrorCode(code, response.status)
              ? code
              : codeForStatus(response.status);
            throw new MatrixApiError(remoteCode, response.status, remoteCode, {
              requestId,
              retryable: isSafeReadMethod(init.method) && isRetryableStatus(response.status),
            });
          }
          const contentType = response.headers.get('content-type') ?? '';
          if (!isJsonContentType(contentType)) {
            throw new MatrixApiError('NON_JSON_RESPONSE', response.status, 'NON_JSON_RESPONSE', { requestId });
          }
          try {
            return await response.json() as T;
          } catch {
            throw new MatrixApiError('NON_JSON_RESPONSE', response.status, 'NON_JSON_RESPONSE', { requestId });
          }
        }, { signal: init.signal });
      } catch (error) {
        if (error instanceof MatrixApiError) throw error;
        if (error instanceof ApiRequestError && error.code === 'REQUEST_TIMEOUT') {
          throw new MatrixApiError('REQUEST_TIMEOUT', 0, 'REQUEST_TIMEOUT', {
            requestId,
            retryable: isSafeReadMethod(init.method),
          });
        }
        if (error instanceof ApiRequestError && error.code === 'REQUEST_ABORTED') {
          throw new MatrixApiError('REQUEST_ABORTED', 0, 'REQUEST_ABORTED', { requestId });
        }
        throw new MatrixApiError('NETWORK_ERROR', 0, 'NETWORK_ERROR', {
          requestId,
          retryable: isSafeReadMethod(init.method),
        });
      }
    },
  };
}

const matrixClient = createMatrixApiClient(async () => {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
});

export function matrixApiFetch<T>(
  path: string,
  init?: RequestInit,
  options?: { auth?: 'required' | 'optional' },
) {
  return matrixClient.fetchJson<T>(path, init, options);
}
