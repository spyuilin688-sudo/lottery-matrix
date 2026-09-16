import { describe, expect, it, vi } from 'vitest';
import {
  createSupabaseWatchdogSnapshotLoader,
  planWatchdogActions,
} from './watchdog';

describe('watchdog active analysis resolution', () => {
  it('treats current split v14 active analyses as complete instead of analysis-missing', async () => {
    const period = '115000215';
    const supabaseRequest = vi.fn(async (path: string) => {
      if (path.startsWith('system_job_status?')) return [];
      if (path.startsWith('lottery_draws?')) {
        return [{ period, draw_date: '2026-09-04' }];
      }
      if (path === 'rpc/matrix_watchdog_analysis_state') {
        return {
          drawPeriod: period,
          status: 'complete',
          startedAt: '2026-09-04T12:34:00.000Z',
          updatedAt: '2026-09-04T12:40:00.000Z',
          leaseExpiresAt: null,
          requiredOrders: ['sorted', 'draw'],
          activeVersions: {
            sorted: `${period}:matrix-python-v14-sorted`,
            draw: `${period}:matrix-python-v14-draw`,
          },
        };
      }
      throw new Error(`unexpected watchdog query: ${path}`);
    });

    const load = createSupabaseWatchdogSnapshotLoader({ supabaseRequest });
    const snapshots = await load();
    const snapshot = snapshots.find((item) => item.lottery === '今彩539');

    expect(snapshot?.latestAnalysis).toMatchObject({
      drawPeriod: period,
      status: 'complete',
    });
    expect(supabaseRequest.mock.calls.some(([path]) => String(path).includes('matrix-python-v12'))).toBe(false);
    expect(planWatchdogActions(
      snapshot ? [snapshot] : [],
      new Date('2026-09-04T12:43:00.000Z'),
    )).toEqual([]);
  });
});
