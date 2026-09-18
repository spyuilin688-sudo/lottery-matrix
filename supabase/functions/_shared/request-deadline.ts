export const LINE_LOGOUT_STAGE_TIMEOUT_MS = 5_000;

export type RequestDeadlineCode = 'REQUEST_TIMEOUT' | 'REQUEST_ABORTED';

export class RequestDeadlineError extends Error {
  constructor(readonly code: RequestDeadlineCode) {
    super(code);
    this.name = 'RequestDeadlineError';
  }
}

type RequestDeadlineOptions = {
  signal?: AbortSignal | null;
  timeoutMs?: number;
};

export function withRequestDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: RequestDeadlineOptions = {},
): Promise<T> {
  const callerSignal = options.signal;
  if (callerSignal?.aborted) {
    return Promise.reject(new RequestDeadlineError('REQUEST_ABORTED'));
  }

  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    };
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abortWith = (code: RequestDeadlineCode) => {
      const failure = new RequestDeadlineError(code);
      controller.abort(failure);
      settle(() => reject(failure));
    };
    const onCallerAbort = () => abortWith('REQUEST_ABORTED');

    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
    timer = setTimeout(
      () => abortWith('REQUEST_TIMEOUT'),
      options.timeoutMs ?? LINE_LOGOUT_STAGE_TIMEOUT_MS,
    );

    Promise.resolve()
      .then(() => operation(controller.signal))
      .then(
        (value) => settle(() => resolve(value)),
        (error) => settle(() => reject(error)),
      );
  });
}
