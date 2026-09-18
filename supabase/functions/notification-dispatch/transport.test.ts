import { afterEach, expect, test, vi } from 'vitest';
import { createNotificationFetch } from './transport.ts';

afterEach(() => vi.useRealTimers());

test('database requests abort if the server never responds and are not replayed', async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | null | undefined;
  const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    signal = init?.signal;
    return new Promise<Response>(() => {});
  });
  const pending = createNotificationFetch(fetcher)('https://database.test/rpc', { method: 'POST' });
  const rejection = expect(pending).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
  await vi.advanceTimersByTimeAsync(8_000);
  await rejection;
  expect(signal?.aborted).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test('database body delivery shares the deadline and empty responses stay valid', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValue(new Response(new ReadableStream()));
  const rejection = expect(createNotificationFetch(fetcher)('https://database.test/rpc'))
    .rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
  await vi.advanceTimersByTimeAsync(8_000);
  await rejection;
  const noContent = await createNotificationFetch(async () => new Response(null, { status: 204 }))('https://database.test/rpc');
  expect(noContent.status).toBe(204);
  const response = await createNotificationFetch(async () => new Response('[1]', { headers: { 'content-type': 'application/json' } }))('https://database.test/rpc');
  expect(await response.json()).toEqual([1]);
  expect(vi.getTimerCount()).toBe(0);
});
