export const API_REQUEST_TIMEOUT_MS = 15_000;

export type ApiRequestErrorCode = 'REQUEST_TIMEOUT' | 'REQUEST_ABORTED' | 'NETWORK_ERROR';

export class ApiRequestError extends Error {
  readonly code: ApiRequestErrorCode;

  constructor(code: ApiRequestErrorCode) {
    super(code);
    this.name = 'ApiRequestError';
    this.code = code;
  }
}

type DeadlineOptions = {
  signal?: AbortSignal | null;
  timeoutMs?: number;
};

export function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: DeadlineOptions = {},
): Promise<T> {
  const callerSignal = options.signal;
  if (callerSignal?.aborted) {
    return Promise.reject(new ApiRequestError('REQUEST_ABORTED'));
  }

  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    };
    const beginSettlement = () => {
      if (settled) return;
      settled = true;
      cleanup();
      return true;
    };
    const resolveOnce = (value: T) => {
      if (beginSettlement()) resolve(value);
    };
    const rejectOnce = (error: unknown) => {
      if (beginSettlement()) reject(error);
    };
    const abortWith = (code: Extract<ApiRequestErrorCode, 'REQUEST_TIMEOUT' | 'REQUEST_ABORTED'>) => {
      const error = new ApiRequestError(code);
      controller.abort(error);
      rejectOnce(error);
    };
    const onCallerAbort = () => abortWith('REQUEST_ABORTED');

    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
    timer = setTimeout(
      () => abortWith('REQUEST_TIMEOUT'),
      options.timeoutMs ?? API_REQUEST_TIMEOUT_MS,
    );

    Promise.resolve()
      .then(() => operation(controller.signal))
      .then(
        resolveOnce,
        rejectOnce,
      );
  });
}

export function isSafeReadMethod(method: string | undefined): boolean {
  const normalizedMethod = (method ?? 'GET').toUpperCase();
  return normalizedMethod === 'GET' || normalizedMethod === 'HEAD';
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500 && status <= 599;
}

type FetchPolicyOptions = DeadlineOptions & {
  fetcher?: typeof fetch;
};

function cancelResponseBody(response: Response, reason?: unknown) {
  if (!response.body || response.body.locked) return;
  void response.body.cancel(reason).catch(() => undefined);
}

async function drainResponseBody(response: Response, signal: AbortSignal) {
  if (!response.body) return;
  const reader = response.body.getReader();
  const abortPromise = new Promise<never>((_, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    while (true) {
      const result = await Promise.race([reader.read(), abortPromise]);
      if (result.done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

async function fetchOnce(
  input: RequestInfo | URL,
  init: RequestInit,
  fetcher: typeof fetch,
  signal: AbortSignal,
) {
  let response: Response | undefined;
  try {
    response = await fetcher(input, { ...init, signal });
    if (signal.aborted) {
      cancelResponseBody(response, signal.reason);
      throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    }
    await drainResponseBody(response.clone(), signal);
    return response;
  } catch (error) {
    if (response) cancelResponseBody(response, error);
    throw error;
  }
}

function toPublicFetchError(error: unknown) {
  if (error instanceof ApiRequestError) return error;
  return new ApiRequestError('NETWORK_ERROR');
}

export async function fetchWithPolicy(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchPolicyOptions = {},
) {
  const fetcher = options.fetcher ?? fetch;
  const safeRead = isSafeReadMethod(init.method);
  const maxAttempts = safeRead ? 2 : 1;
  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await withDeadline(
        (signal) => fetchOnce(input, init, fetcher, signal),
        options,
      );
      lastResponse = response;
      if (!safeRead || !isRetryableStatus(response.status) || attempt + 1 >= maxAttempts) {
        return response;
      }
      cancelResponseBody(response);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code !== 'NETWORK_ERROR') throw error;
      if (!safeRead || attempt + 1 >= maxAttempts) throw toPublicFetchError(error);
    }
  }
  if (lastResponse) return lastResponse;
  throw new ApiRequestError('NETWORK_ERROR');
}

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function withRequestId(headersInit?: HeadersInit) {
  const headers = new Headers(headersInit);
  const provided = headers.get('X-Request-ID');
  const requestId = provided && REQUEST_ID_PATTERN.test(provided)
    ? provided
    : crypto.randomUUID();
  headers.set('X-Request-ID', requestId);
  return { headers, requestId };
}
