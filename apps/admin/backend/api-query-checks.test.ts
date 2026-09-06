import { describe, expect, it, vi } from 'vitest';
import { createApiQueryChecks, queryCheckIds } from './api-query-checks';

const response = (value: unknown) => new Response(JSON.stringify(value));
function fixture(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(String(input));
  if (url.pathname.includes('/rpc/')) {
    const body = JSON.parse(url.searchParams.get('p_request')!);
    return response(url.pathname.endsWith('_validation')
      ? { ...body, status: 'complete', validation: { ruleSets: [] } }
      : { kind: 'explore', lottery: body.lottery, status: 'complete', drawPeriod: '123', analysisVersion: '123:v12', total: 1, items: [{ id: 'sample' }] });
  }
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const lottery = body?.lottery ?? decodeURIComponent(url.pathname.split('/').pop()!);
  const numbers = ['今彩539', '天天樂'].includes(lottery) ? ['01', '02', '03', '04', '05'] : ['01', '02', '03', '04', '05', '06', '07'];
  const item = { period: '123', numbers };
  if (url.pathname.includes('/cards/')) return response({ lottery, period: '123', cards: { draw: { url: 'https://cards.test/draw.png', mimeType: 'image/png' }, sorted: { url: 'https://cards.test/sorted.png', mimeType: 'image/png' } } });
  if (url.pathname.includes('/latest/')) return response({ item });
  if (url.pathname.includes('/history/')) return response({ items: [item] });
  if (url.pathname.endsWith('/tongxing')) return response({ ...body, groups: [{ lockedEntry: item, predictedEntry: { ...item, period: '124' } }] });
  return response({ ...body, items: [{ ...item, matchSlots: numbers.map((n) => ['01', '02', '03'].indexOf(n) + 1) }] });
}
const make = (fetcher: typeof fetch, timeoutMs = 1000) => createApiQueryChecks({ fetcher, loadWorkerUrl: async () => 'https://worker.test', loadSupabaseConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'server-secret' }), timeoutMs });

describe('automatic per API queries', () => {
  it('queries all four lotteries for each API, shares list samples and never invokes mutation routes', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => fixture(input, init));
    const probe = make(fetcher);
    const results = await Promise.all([...queryCheckIds].map(probe));
    expect(results.every((r) => r.ok && r.samples.length === 4 && !r.skipped)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(28);
    const urls = fetcher.mock.calls.map(([url]) => new URL(String(url)));
    expect(urls.filter((url) => url.pathname.endsWith('matrix_explore_list'))).toHaveLength(4);
    for (const [url, init] of fetcher.mock.calls) {
      expect(init?.redirect).toBe('error');
      if (init?.method === 'POST') expect(['/api/matrix/tongxing', '/api/matrix/number-reference']).toContain(new URL(String(url)).pathname);
      if (String(url).startsWith('https://worker.test')) expect(JSON.stringify(init)).not.toContain('server-secret');
      expect(String(url)).not.toMatch(/jobs\/(refresh|recover)|notification|member_|_save|_reset/);
    }
  });
  it('reports a per-lottery HTTP error even if the host is healthy', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => decodeURIComponent(String(input)).includes('六合彩') ? new Response('private upstream details', { status: 503 }) : fixture(input, init));
    const result = await make(fetcher)('railway-latest');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('六合彩：查詢失敗（HTTP 503）');
    expect(JSON.stringify(result)).not.toContain('private upstream');
    expect(result.samples.filter((sample) => sample.ok)).toHaveLength(3);
  });
  it('rejects HTTP 200 with malformed or missing draw data', async () => {
    expect((await make(async () => response({ item: null }))('railway-latest')).ok).toBe(false);
    expect((await make(async () => response({ item: { period: '123', numbers: ['01', '01', '03', '04', '05'] } }))('railway-latest')).ok).toBe(false);
  });
  it('does not claim validation passed when there are no sample items', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const body = JSON.parse(new URL(String(input)).searchParams.get('p_request')!);
      return response({ kind: 'explore', lottery: body.lottery, status: 'complete', drawPeriod: '123', analysisVersion: '123:v12', total: 0, items: [] });
    });
    const result = await make(fetcher)('supabase-rpc-matrix_explore_validation');
    expect(result).toMatchObject({ ok: true, skipped: true });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes('matrix_explore_validation'))).toBe(true);
  });
  it('bounds concurrent requests and times out fetch and response-body hangs', async () => {
    const fetcher = vi.fn(async () => new Promise<Response>(() => {}));
    const probe = make(fetcher, 15);
    const results = await Promise.all([...queryCheckIds].map(probe));
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(4);
    expect(results.every((result) => !result.ok)).toBe(true);
    const result = await make(async () => ({ ok: true, json: () => new Promise(() => {}) }) as Response, 15)('railway-latest');
    expect(result.error).toContain('逾時');
  });
});
