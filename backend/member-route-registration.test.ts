import { describe, expect, it, vi } from 'vitest';

vi.mock('./scraper', () => ({
  backfillRange: vi.fn(),
  backfillSourceRange: vi.fn(),
  backfillYear: vi.fn(),
  completeHistoricalSource: vi.fn(),
  fetchSource: vi.fn(),
  getHistoricalMaintenanceStatus: vi.fn(),
  getMatrixAudit: vi.fn(),
  getMatrixCoverage: vi.fn(),
  getMatrixHistory: vi.fn(),
  getMatrixLatest: vi.fn(),
  inspectBrightstreamHistory: vi.fn(),
  inspectBrightstreamMarkSixDeep: vi.fn(),
  inspectHkHistoryCandidates: vi.fn(),
  inspectLotto8HistoryOnly: vi.fn(),
  inspectNfdDatabaseFiles: vi.fn(),
  inspectNfdLotto8HistoryMap: vi.fn(),
  inspectNfdNativeDateSources: vi.fn(),
  listRecords: vi.fn(),
  refreshActiveSources: vi.fn(),
}));
import { handler } from './index';

describe('member route registration', () => {
  it('registers all authenticated member routes in the AppDeploy router', async () => {
    const routes = handler as Record<string, Array<(input: {
      body?: unknown;
      event?: { headers?: Record<string, string> };
    }) => Promise<unknown>>>;
    const memberPaths = [
      'GET /api/member/profile',
      'GET /api/member/notification-settings',
      'PUT /api/member/notification-settings',
    ] as const;

    for (const path of memberPaths) {
      expect(routes[path]).toHaveLength(1);
      await expect(routes[path][0]({ event: { headers: {} }, body: {} })).resolves.toEqual({
        body: { error: { code: 'AUTH_REQUIRED' } },
        statusCode: 401,
      });
    }
  });
});
