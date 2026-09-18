import { beforeEach, describe, expect, it, vi } from 'vitest';

const bootstrapPost = vi.hoisted(() => vi.fn());

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
vi.mock('./member-bootstrap-routes', () => ({
  createMemberBootstrapRoutes: () => ({ post: bootstrapPost }),
}));
import { handler } from './index';

describe('member route registration', () => {
  beforeEach(() => {
    bootstrapPost.mockReset().mockImplementation(async ({ authorization }: { authorization?: string }) => (
      authorization
        ? { status: 200, body: { memberId: 'member-1', lineUserId: 'line-user-1' } }
        : { status: 401, body: { error: { code: 'AUTH_REQUIRED' } } }
    ));
  });

  it('registers all authenticated member routes in the AppDeploy router', async () => {
    const routes = handler as Record<string, Array<(input: {
      body?: unknown;
      event?: { headers?: Record<string, string> };
    }) => Promise<unknown>>>;
    const memberPaths = [
      'POST /api/member/bootstrap',
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

  it('does not register the Supabase-owned LINE logout route', () => {
    const routes = handler as Record<string, unknown>;

    expect(routes['POST /api/auth/line/logout']).toBeUndefined();
  });

  it('ignores a forged line_user_id body when bootstrapping', async () => {
    const routes = handler as Record<string, Array<(input: {
      body?: unknown;
      event?: { headers?: Record<string, string> };
    }) => Promise<unknown>>>;

    await expect(routes['POST /api/member/bootstrap'][0]({
      event: { headers: { authorization: 'Bearer supabase-access-token' } },
      body: { line_user_id: 'forged-line-user-id' },
    })).resolves.toEqual({
      body: { memberId: 'member-1', lineUserId: 'line-user-1' },
      statusCode: 200,
    });

    expect(bootstrapPost).toHaveBeenCalledWith({ authorization: 'Bearer supabase-access-token' });
  });
});
