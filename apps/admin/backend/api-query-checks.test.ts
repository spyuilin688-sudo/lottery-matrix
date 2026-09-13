import { describe, expect, it, vi } from 'vitest';
import { createApiQueryChecks, queryCheckIds } from './api-query-checks';

const response = (value: unknown) => new Response(JSON.stringify(value));
function fixture(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(String(input));
  if (url.pathname.includes('/rpc/')) {
    const body = JSON.parse(String(init?.body)).p_request;
    return response(url.pathname.endsWith('_validation')
      ? { ...body, status: 'complete', validation: { ruleSets: [] } }
      : { kind: url.pathname.includes('_tianheng_') ? 'tianheng' : 'explore', lottery: body.lottery, status: 'complete', drawPeriod: '123', analysisVersion: '123:v12', total: 1, items: [{ id: 'sample' }] });
  }
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const lottery = body?.lottery ?? decodeURIComponent(url.pathname.split('/').pop()!);
  const numbers = ['今彩539', '天天樂'].includes(lottery) ? ['01', '02', '03', '04', '05'] : ['01', '02', '03', '04', '05', '06', '07'];
  const item = { period: '123', numbers, resultStatus: 'confirmed', drawOrderNumbers: lottery === '天天樂' ? null : numbers };
  if (url.pathname.includes('/cards/')) return response({ lottery, period: '123', cards: { draw: { url: 'https://cards.test/draw.png', mimeType: 'image/png' }, sorted: { url: 'https://cards.test/sorted.png', mimeType: 'image/png' } } });
  if (url.pathname.includes('/latest/')) return response({ item });
  if (url.pathname.includes('/history/')) return response({ items: [item] });
  if (url.pathname.endsWith('/tongxing')) return response({ ...body, groups: [{ lockedEntry: item, predictedEntry: { ...item, period: '124' } }] });
  return response({ ...body, items: [{ ...item, matchSlots: numbers.map((n) => ['01', '02', '03'].indexOf(n) + 1) }] });
}
const make = (fetcher: typeof fetch, timeoutMs = 1000) => createApiQueryChecks({ fetcher, loadWorkerUrl: async () => 'https://worker.test', loadSupabaseConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'server-secret' }), timeoutMs });

describe('automatic per API queries', () => {
  it('checks Tianheng using its three-period public settings and a version-pinned validation sample', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)).p_request;
      expect(request.explorePeriods).toBe(3);
      expect(request.exploreRange).toBe('標準範圍');
      if (String(input).endsWith('_validation')) {
        expect(request).toMatchObject({ itemId: 'balance', drawPeriod: '123', analysisVersion: '123:v15-sorted' });
        return response({ ...request, status: 'complete', validation: { ruleSets: [] } });
      }
      return response({ kind: 'tianheng', lottery: request.lottery, status: 'complete', drawPeriod: '123', analysisVersion: '123:v15-sorted', total: 1, items: [{ id: 'balance' }] });
    });
    const probe = make(fetcher);
    const results = await Promise.all(['list', 'validation'].map(part => probe(`supabase-rpc-matrix_tianheng_${part}`)));
    expect(results.every(result => result.ok && !result.skipped)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(fetcher.mock.calls.every(([url]) => String(url).includes('/matrix_tianheng_'))).toBe(true);
  });

  it('calls volatile Supabase RPCs with POST JSON bodies', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'POST') return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }), { status: 405 });
      const body = JSON.parse(String(init.body));
      const request = body.p_request;
      return response({ kind: 'explore', lottery: request.lottery, status: 'complete', drawPeriod: '123', analysisVersion: '123:v12', total: 0, items: [] });
    });

    const result = await make(fetcher)('supabase-rpc-matrix_explore_list');

    expect(result.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls.every(([url, init]) => {
      const parsed = new URL(String(url));
      return init?.method === 'POST'
        && parsed.search === ''
        && new Headers(init.headers).get('Content-Type') === 'application/json'
        && typeof JSON.parse(String(init.body)).p_request === 'object';
    })).toBe(true);
  });

  it('queries all four lotteries for each API, shares list samples and never invokes mutation routes', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => fixture(input, init));
    const probe = make(fetcher);
    const results = await Promise.all([...queryCheckIds].map(probe));
    expect(results.every((r) => r.ok && r.samples.length === 4 && !r.skipped)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(36);
    const urls = fetcher.mock.calls.map(([url]) => new URL(String(url)));
    expect(urls.filter((url) => url.pathname.endsWith('matrix_explore_list'))).toHaveLength(4);
    for (const [url, init] of fetcher.mock.calls) {
      expect(init?.redirect).toBe('error');
      if (init?.method === 'POST' && String(url).startsWith('https://worker.test')) expect(['/api/matrix/tongxing', '/api/matrix/number-reference']).toContain(new URL(String(url)).pathname);
      if (String(url).startsWith('https://db.test')) {
        expect(init?.method).toBe('POST');
        expect(new URL(String(url)).search).toBe('');
        expect(typeof JSON.parse(String(init?.body)).p_request).toBe('object');
      }
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
  it('accepts the confirmed Fantasy5 sorted-only PNG without requiring an actual-order card', async () => {
    const result = await make(async (input, init) => {
      const value = await fixture(input, init).json();
      if (new URL(String(input)).pathname.includes('/cards/') && value.lottery === '天天樂') delete value.cards.draw;
      return response(value);
    })('railway-cards');
    expect(result).toMatchObject({ ok: true, waiting: false });
    expect(result.samples.find(sample => sample.lottery === '天天樂')).toMatchObject({ ok: true, period: '123' });
  });
  it('reports preliminary sorted-only cards as waiting for official results without a fault or completed claim', async () => {
    const result = await make(async (input, init) => {
      const value = await fixture(input, init).json();
      if (value.cards) delete value.cards.draw;
      if (value.item) { value.item.resultStatus = 'preliminary'; value.item.drawOrderNumbers = null; }
      return response(value);
    })('railway-cards');
    expect(result).toMatchObject({ ok: true, waiting: true, error: '' });
    expect(result.samples.every(sample => 'waiting' in sample && sample.waiting)).toBe(true);
  });
  it('reports the canonical empty publication as generating without claiming a PNG is available', async () => {
    const result = await make(async (input, init) => {
      const value = await fixture(input, init).json();
      return response(value.cards ? { lottery: value.lottery, period: null, cards: {} } : value);
    })('railway-cards');
    expect(result).toMatchObject({ ok: true, waiting: true, error: '' });
    expect(result.samples.find(sample => sample.lottery === '天天樂')).toMatchObject({ ok: true, period: '123', waitingFor: 'generation' });
  });
  it.each([
    ['missing sorted PNG', (value: any) => { delete value.cards.sorted; }],
    ['invalid sorted media type', (value: any) => { value.cards.sorted.mimeType = 'text/html'; }],
    ['stale manifest period', (value: any) => { value.period = '122'; }],
    ['malformed advertised actual PNG', (value: any) => { value.cards.draw.url = 'http://cards.test/draw.png'; }],
    ['null period with a nonempty manifest', (value: any) => { value.period = null; }],
    ['missing period in a nonempty manifest', (value: any) => { delete value.period; }],
  ])('keeps %s abnormal', async (_label, change) => {
    const result = await make(async (input, init) => {
      const value = await fixture(input, init).json();
      if (value.cards && value.lottery === '今彩539') change(value);
      return response(value);
    })('railway-cards');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('今彩539');
  });
  it.each([
    ['今彩539', 227, false], ['今彩539', 227, true],
    ['六合彩', 171, false], ['六合彩', 171, true],
    ['大樂透', 171, false], ['大樂透', 171, true],
  ] as const)('checks the %s renderer window (%i rows; missing historical actual: %s)', async (lottery, count, missingHistoricalActual) => {
    const result = await make(async (input, init) => {
      const url = new URL(String(input));
      const value = await fixture(input, init).json();
      if (value.cards && value.lottery === lottery) { delete value.cards.draw; value.period = '11997'; }
      if (value.item && decodeURIComponent(url.pathname).endsWith(lottery)) value.item.period = '11997';
      if (url.pathname.includes('/history/') && decodeURIComponent(url.pathname).endsWith(lottery)) {
        const numbers = lottery === '今彩539' ? ['01', '02', '03', '04', '05'] : ['01', '02', '03', '04', '05', '06', '07'];
        value.items = Array.from({ length: count }, (_, index) => ({
          period: String(11997 - index), numbers,
          resultStatus: 'confirmed', drawOrderNumbers: missingHistoricalActual && index === 1 ? null : numbers,
        }));
      }
      return response(value);
    })('railway-cards');
    expect(result).toMatchObject({ ok: missingHistoricalActual, waiting: missingHistoricalActual });
  });
  it('rejects malformed actual numbers instead of downgrading the required card capability', async () => {
    const result = await make(async (input, init) => {
      const value = await fixture(input, init).json();
      if (value.cards && value.lottery === '今彩539') delete value.cards.draw;
      if (value.item && decodeURIComponent(String(input)).includes('今彩539')) value.item.drawOrderNumbers = ['01', '01', '03', '04', '05'];
      return response(value);
    })('railway-cards');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('今彩539');
  });
  it.each([
    ['caught up', '124', false],
    ['still changing', '125', true],
  ])('rechecks a card/latest snapshot once when a new draw arrives (%s)', async (_label, finalLatestPeriod, waiting) => {
    let cardReads = 0;
    let latestReads = 0;
    const result = await make(async (input, init) => {
      const path = decodeURIComponent(new URL(String(input)).pathname);
      const value = await fixture(input, init).json();
      if (path.endsWith('/天天樂') && value.cards) value.period = ++cardReads === 1 ? '123' : '124';
      if (path.endsWith('/天天樂') && value.item) value.item.period = ++latestReads === 1 ? '124' : finalLatestPeriod;
      return response(value);
    })('railway-cards');
    expect(result).toMatchObject({ ok: true, waiting });
    expect(cardReads).toBe(2);
    expect(latestReads).toBe(2);
    if (waiting) expect(result.samples.find(sample => sample.lottery === '天天樂')).toMatchObject({ waitingFor: 'publication' });
  });
  it('keeps a history snapshot that advanced during card verification limited', async () => {
    let latestReads = 0;
    const result = await make(async (input, init) => {
      const path = decodeURIComponent(new URL(String(input)).pathname);
      const value = await fixture(input, init).json();
      if (path.endsWith('/今彩539')) {
        if (value.cards) { delete value.cards.draw; value.period = '11997'; }
        if (value.item) value.item.period = ++latestReads === 1 ? '11997' : '11998';
        if (value.items) value.items = Array.from({ length: 227 }, (_, index) => ({
          period: String(11998 - index), numbers: ['01', '02', '03', '04', '05'],
          resultStatus: 'confirmed', drawOrderNumbers: ['01', '02', '03', '04', '05'],
        }));
      }
      return response(value);
    })('railway-cards');
    expect(result).toMatchObject({ ok: true, waiting: true });
    expect(result.samples.find(sample => sample.lottery === '今彩539')).toMatchObject({ waitingFor: 'publication' });
    expect(latestReads).toBe(2);
  });
  it('does not claim validation passed when there are no sample items', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)).p_request;
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
