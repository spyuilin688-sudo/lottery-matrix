import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseTransport } from './supabase';
const config = { url: 'https://example.supabase.co', serviceRoleKey: 'secret' };
const never = () => new Promise<never>(() => {});
afterEach(() => vi.useRealTimers());
describe('admin Supabase request deadline', () => {
  it.each(['config', 'fetch', 'body', 'error body', 'count body'])('bounds a stalled %s without replaying a write', async (phase) => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn(async (_url, init) => {
      signal = init?.signal;
      if (phase === 'fetch') return never();
      return { ok: phase !== 'error body', status: phase === 'error body' ? 400 : 200,
        headers: new Headers({ 'Content-Range': '0-0/1' }), json: never } as Response;
    });
    const transport = createSupabaseTransport(phase === 'config' ? never : config, fetcher);
    const result = transport.request('rest/v1/rpc/admin_record_payment_reversal', { method: 'POST' }, phase === 'count body').catch(e => e);
    await vi.advanceTimersByTimeAsync(15_001);
    const settled = await Promise.race([result, Promise.resolve('pending')]);
    expect(settled).toMatchObject({ code: 'UNAVAILABLE', statusCode: 503 });
    expect(fetcher).toHaveBeenCalledTimes(phase === 'config' ? 0 : 1);
    if (signal) expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not start fetch after configuration resolves beyond deadline', async () => {
    vi.useFakeTimers();
    let resolve!: (value: typeof config) => void;
    const fetcher = vi.fn();
    const transport = createSupabaseTransport(() => new Promise(r => { resolve = r; }), fetcher);
    const result = transport.request('rest/v1/admin_sessions').catch(e => e);
    await vi.advanceTimersByTimeAsync(15_001);
    resolve(config);
    await Promise.resolve(); await Promise.resolve();
    expect(await Promise.race([result, Promise.resolve('pending')])).toMatchObject({ code: 'UNAVAILABLE' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('honors cancellation and removes listeners after success', async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const remove = vi.spyOn(caller.signal, 'removeEventListener');
    const transport = createSupabaseTransport(config, async () => new Response('[]'));
    await expect(transport.request('rest/v1/admin_sessions', { signal: caller.signal })).resolves.toEqual([]);
    expect(remove).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    caller.abort();
    await expect(transport.request('rest/v1/admin_sessions', { signal: caller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('redacts a response body read failure', async () => {
    const transport = createSupabaseTransport(config, async () => ({ ok: true, status: 200, json: async () => { throw Error('secret'); } }) as Response);
    await expect(transport.request('rest/v1/admin_sessions')).rejects.toMatchObject({ code: 'UNAVAILABLE', statusCode: 503 });
  });
});
