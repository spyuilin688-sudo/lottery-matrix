export const API_REQUEST_TIMEOUT_MS = 8_000;

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
  if (signal.aborted) {
    cancelResponseBody(response, signal.reason);
    throw signal.reason;
  }
  const bufferedBranch = response.clone();
  const reader = bufferedBranch.body?.getReader();
  if (!reader) return response;

  const cancel = () => {
    void reader.cancel(signal.reason).catch(() => undefined);
    cancelResponseBody(response, signal.reason);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (!(await reader.read()).done) {
      // Draining the clone keeps the returned branch buffered under this deadline.
    }
    if (signal.aborted) throw signal.reason;
    return response;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

export function fetchWithPolicy(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchPolicyOptions = {},
): Promise<Response> {
  const request = typeof Request !== 'undefined' && input instanceof Request ? input : undefined;
  const method = init.method ?? request?.method;
  const safeRead = isSafeReadMethod(method);
  const callerSignal = init.signal ?? request?.signal;
  const fetcher = options.fetcher ?? globalThis.fetch;

  return withDeadline(async (signal) => {
    const attempts = safeRead ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetcher(input, { ...init, signal });
        if (attempt + 1 < attempts && isRetryableStatus(response.status)) {
          cancelResponseBody(response);
          continue;
        }
        return await drainResponseBody(response, signal);
      } catch {
        if (signal.aborted) throw signal.reason;
        if (attempt + 1 < attempts) continue;
        throw new ApiRequestError('NETWORK_ERROR');
      }
    }
    throw new ApiRequestError('NETWORK_ERROR');
  }, {
    signal: callerSignal,
    timeoutMs: options.timeoutMs,
  });
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function withRequestId(headersInit?: HeadersInit): { headers: Headers; requestId: string } {
  const headers = new Headers(headersInit);
  const callerId = headers.get('X-Request-ID');
  const requestId = callerId && UUID_PATTERN.test(callerId)
    ? callerId
    : crypto.randomUUID();
  headers.set('X-Request-ID', requestId);
  return { headers, requestId };
}
