import { describe, expect, it, vi } from 'vitest';
import { createConnectionStatus } from './connection-status';
import { matrixStorageFixture } from './matrix-storage-status.fixture';

const endpoint = 'https://db.test/rest/v1/rpc/matrix_analysis_storage_health';
const check = async (fetcher: typeof fetch) => {
  const result = await createConnectionStatus({
    supabase: { selectRows: async () => [] },
    loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'private-service-key' }),
    getWorkerStatus: async () => ({ ok: false, reason: 'APPDEPLOY_CONFIG_MISSING', health: null, jobs: null }),
    fetcher, requestTimeoutMs: 25,
  }).get();
  return result.items.find(item => item.id === 'matrix-storage');
};
const fetchPayload = (body: unknown) => vi.fn(async (input: RequestInfo | URL) => Response.json(String(input) === endpoint ? body : []));

describe('Matrix Storage service evidence', () => {
  it.each(['Healthy', 'Warning', 'Critical'] as const)('preserves SQL %s via one service-key GET', async status => {
    const body = { ...matrixStorageFixture(), status };
    const fetcher = fetchPayload(body);
    const item = await check(fetcher);
    expect(item).toMatchObject({ id: 'matrix-storage', location: 'Supabase', checkMode: 'service', checkEvidence: 'reported', ok: status === 'Healthy', detail: body });
    expect(fetcher.mock.calls.filter(([url]) => String(url) === endpoint)).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(endpoint, expect.objectContaining({ method: 'GET', cache: 'no-store', redirect: 'error', signal: expect.any(AbortSignal), headers: { apikey: 'private-service-key', Authorization: 'Bearer private-service-key' } }));
    expect(JSON.stringify(item)).not.toContain('private-service-key');
  });
  it.each([null, [], {}, { ...matrixStorageFixture(), database_size_bytes: -1 }, { ...matrixStorageFixture(), active_versions: '24' }, { ...matrixStorageFixture(), active_versions: 1.5 }, { ...matrixStorageFixture(), tables: {} }, { ...matrixStorageFixture(), status: 'Excellent' }, { ...matrixStorageFixture(), status: ['Healthy'] }, { ...matrixStorageFixture(), checked_at: '2026-02-31T02:00:00Z' }, { ...matrixStorageFixture(), checked_at: 'yesterday' }, { ...matrixStorageFixture(), cleanup: {} }])('reports malformed payload as unavailable: %j', async body => {
    expect(await check(fetchPayload(body))).toMatchObject({ ok: false, healthState: 'unknown', detail: null, error: 'Matrix Storage 狀態暫時無法取得，請重新檢查。' });
  });
  it.each(['http', 'network', 'timeout', 'body'] as const)('contains %s failure without exposing upstream data', async mode => {
    const item = await check(async input => {
      if (String(input) !== endpoint) return Response.json([]);
      if (mode === 'http') return new Response('secret database detail', { status: 503 });
      if (mode === 'network') throw new Error('private-service-key');
      if (mode === 'timeout') return new Promise(() => {});
      return { ok: true, json: () => new Promise(() => {}) } as Response;
    });
    expect(item).toMatchObject({ ok: false, healthState: 'unknown', detail: null });
    expect(JSON.stringify(item)).not.toMatch(/private-service-key|secret database detail/);
  });
});
