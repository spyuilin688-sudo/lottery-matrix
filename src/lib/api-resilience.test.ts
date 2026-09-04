import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  API_REQUEST_TIMEOUT_MS,
  fetchWithPolicy,
  withDeadline,
  withRequestId,
} from './api-resilience';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('withDeadline', () => {
  it('rejects a stalled operation with the fixed timeout error at eight seconds', async () => {
    vi.useFakeTimers();
    let operationSignal: AbortSignal | undefined;
    const result = withDeadline((signal) => {
      operationSignal = signal;
      return new Promise<never>(() => undefined);
    });
    const rejection = expect(result).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
      message: 'REQUEST_TIMEOUT',
    });

    await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS);

    await rejection;
    expect(operationSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('maps external cancellation to a fixed error and removes its listener', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    let operationSignal: AbortSignal | undefined;
    const result = withDeadline((signal) => {
      operationSignal = signal;
      return new Promise<never>(() => undefined);
    }, { signal: controller.signal });

    controller.abort(new Error('private caller reason'));

    await expect(result).rejects.toMatchObject({
      code: 'REQUEST_ABORTED',
      message: 'REQUEST_ABORTED',
    });
    expect(operationSignal?.aborted).toBe(true);
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['completion', async () => 'done'],
    ['failure', async () => { throw new Error('operation failed'); }],
  ])('clears timer and caller listener after %s', async (_caseName, operation) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');

    await withDeadline(operation, { signal: controller.signal }).catch(() => undefined);

    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('fetchWithPolicy', () => {
  it('keeps the deadline active through response body delivery and cancels a stalled body', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({
      cancel,
    }), {
      headers: { 'content-type': 'application/json' },
    });
    const fetcher = vi.fn().mockResolvedValue(response);
    let settled = false;
    let failure: unknown;

    void fetchWithPolicy('https://api.test/data', {}, { fetcher }).then(
      () => { settled = true; },
      (error: unknown) => {
        settled = true;
        failure = error;
      },
    );
    await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);

    expect(failure).toMatchObject({ code: 'REQUEST_TIMEOUT', message: 'REQUEST_TIMEOUT' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a body returned after the deadline without attaching a stale abort listener', async () => {
    vi.useFakeTimers();
    let resolveFetch!: (response: Response) => void;
    let fetchSignal: AbortSignal | undefined;
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      fetchSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolve) => { resolveFetch = resolve; });
    });
    const rejection = expect(fetchWithPolicy('https://api.test/data', {}, { fetcher }))
      .rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSignal).toBeInstanceOf(AbortSignal);
    const addListener = vi.spyOn(fetchSignal!, 'addEventListener');
    const cancel = vi.fn();

    await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS);
    await rejection;
    resolveFetch(new Response(new ReadableStream<Uint8Array>({ cancel })));
    await Promise.resolve();
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(addListener).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries a GET network failure once without exposing the upstream error', async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error('private upstream token'))
      .mockResolvedValueOnce(new Response('ok'));

    const response = await fetchWithPolicy('https://api.test/data', {}, { fetcher });

    expect(await response.text()).toBe('ok');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([408, 429, 503])('retries a GET response with status %s once', async (status) => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(new Response('ok'));

    await expect(fetchWithPolicy('https://api.test/data', {}, { fetcher }))
      .resolves.toHaveProperty('status', 200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('retries HEAD at most once when both attempts fail', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));

    await expect(fetchWithPolicy('https://api.test/data', { method: 'HEAD' }, { fetcher }))
      .resolves.toHaveProperty('status', 500);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not retry POST after a network failure and returns only a fixed error', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('private upstream body'));

    const failure = await fetchWithPolicy(
      'https://api.test/data',
      { method: 'POST' },
      { fetcher },
    ).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'NETWORK_ERROR', message: 'NETWORK_ERROR' });
    expect(String(failure)).not.toContain('private upstream body');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 404])('does not retry a GET response with status %s', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }));

    await expect(fetchWithPolicy('https://api.test/data', {}, { fetcher }))
      .resolves.toHaveProperty('status', status);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('withRequestId', () => {
  it('preserves a valid caller UUID', () => {
    const callerId = '123e4567-e89b-42d3-a456-426614174000';

    const result = withRequestId({ 'X-Request-ID': callerId });

    expect(result.requestId).toBe(callerId);
    expect(result.headers.get('X-Request-ID')).toBe(callerId);
  });

  it.each([undefined, 'not-a-uuid'])('creates a UUID when caller id is %s', (callerId) => {
    const result = withRequestId(callerId ? { 'X-Request-ID': callerId } : undefined);

    expect(result.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(result.headers.get('X-Request-ID')).toBe(result.requestId);
  });
});
