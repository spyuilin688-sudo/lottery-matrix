import { describe, expect, it, vi } from 'vitest';
import { createApiQueryChecks } from './api-query-checks';

const json = (value: unknown, init?: ResponseInit) => new Response(JSON.stringify(value), init);
const make = (fetcher: typeof fetch) => createApiQueryChecks({
  fetcher,
  loadWorkerUrl: async () => 'https://worker.test',
  loadSupabaseConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'server-secret' }),
  timeoutMs: 1000,
});

describe('stored result evidence and representative validation', () => {
  it.each([
    ['explore', 'matrix_explore_results', 2605, 2],
    ['tianheng', 'matrix_tianheng_results', 731, 3],
  ] as const)('reports the persisted %s count and validates one representative per road type', async (kind, table, storedRecords, explorePeriods) => {
    const validationIds: string[] = [];
    const countRequests: URL[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === `/rest/v1/${table}`) {
        countRequests.push(url);
        expect(init?.method).toBe('HEAD');
        expect(new Headers(init?.headers).get('Prefer')).toBe('count=exact');
        return new Response(null, { status: 200, headers: { 'Content-Range': `0-0/${storedRecords}` } });
      }
      if (!url.pathname.includes('/rpc/')) return new Response(null, { status: 404 });
      const request = JSON.parse(String(init?.body)).p_request;
      if (url.pathname.endsWith('_validation')) {
        validationIds.push(request.itemId);
        expect(request.explorePeriods).toBe(explorePeriods);
        return json({ ...request, status: 'complete', validation: { ruleSets: [] } });
      }
      return json({
        kind,
        lottery: request.lottery,
        status: 'complete',
        drawPeriod: '115000224',
        analysisVersion: `115000224:${kind}-v1-sorted`,
        total: 4,
        items: [
          { id: `${request.lottery}-plus-a`, algorithmType: '加減' },
          { id: `${request.lottery}-plus-b`, algorithmType: '加減' },
          { id: `${request.lottery}-sum`, algorithmType: '合值' },
          { id: `${request.lottery}-drag`, algorithmType: '拖牌' },
        ],
      });
    });

    const result = await make(fetcher)(`supabase-rpc-matrix_${kind}_validation`);

    expect(result.ok).toBe(true);
    expect(result.samples).toHaveLength(4);
    expect(result.samples.every((sample) => sample.records === 4 && sample.storedRecords === storedRecords)).toBe(true);
    expect(validationIds).toHaveLength(12);
    for (const lottery of ['今彩539', '天天樂', '六合彩', '大樂透']) {
      expect(validationIds.filter((id) => id.startsWith(lottery))).toEqual([
        `${lottery}-plus-a`, `${lottery}-sum`, `${lottery}-drag`,
      ]);
    }
    expect(countRequests).toHaveLength(4);
    for (const url of countRequests) {
      expect(url.searchParams.get('select')).toBe('item_id');
      expect(url.searchParams.get('draw_period')).toBe('eq.115000224');
      expect(url.searchParams.get('analysis_version')).toBe(`eq.115000224:${kind}-v1-sorted`);
      expect(url.searchParams.get('number_order')).toBe('eq.依號碼由小到大排序');
      expect(url.searchParams.get('lottery')).toMatch(/^eq\./);
    }
  });
});
