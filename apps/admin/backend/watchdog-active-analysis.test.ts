import { describe, expect, it, vi } from 'vitest';
import {
  createSupabaseWatchdogSnapshotLoader,
  planWatchdogActions,
} from './watchdog';

describe('watchdog active analysis resolution', () => {
  it('shows a missing published card as a failed stage and dispatches card repair', async () => {
    const period = '115000215';
    const request = vi.fn(async (path: string) => {
      if (path === 'rpc/matrix_watchdog_draw_days') return {
        今彩539: ['2026-09-04'],
        天天樂: ['2026-09-04'],
        六合彩: ['2026-09-04'],
        大樂透: ['2026-09-04'],
      };
      if (path.startsWith('system_job_status?')) return [];
      if (path.startsWith('lottery_draws?')) return [{
        period, draw_date: '2026-09-04', result_status: 'confirmed',
        numbers: ['01', '02', '03', '04', '05'], draw_order_numbers: ['05', '04', '03', '02', '01'],
      }];
      if (path === 'rpc/matrix_watchdog_analysis_state') return {
        drawPeriod: period, status: 'complete', leaseExpiresAt: null,
      };
      if (path === 'rpc/matrix_watchdog_chain_state') return {
        latestPeriod: period, analysisComplete: true, matrixStatusComplete: true,
        cardComplete: false,
      };
      throw new Error('unexpected watchdog query');
    });
    const snapshots = await createSupabaseWatchdogSnapshotLoader({ supabaseRequest: request })(
      new Date('2026-09-04T12:43:00.000Z'),
    );
    const snapshot = snapshots.find((item) => item.lottery === '今彩539')!;
    expect(snapshot.chain?.state).toBe('FAIL');
    expect(snapshot.chain?.stages.find((stage) => stage.stage === 'card')?.state).toBe('FAIL');
    expect(planWatchdogActions([snapshot], new Date('2026-09-04T12:43:00.000Z'))).toEqual([{
      lottery: '今彩539', target: 'railway', reasons: ['card-missing'],
    }]);
  });
  it('uses the analysis returned by the chain instead of reading the same period twice', async () => {
    const period = '115000215';
    const request = vi.fn(async (path: string) => {
      if (path === 'rpc/matrix_watchdog_draw_days') return {
        今彩539: ['2026-09-04'], 天天樂: ['2026-09-04'],
        六合彩: ['2026-09-04'], 大樂透: ['2026-09-04'],
      };
      if (path.startsWith('system_job_status?')) return [];
      if (path.startsWith('lottery_draws?')) return [{
        period, draw_date: '2026-09-04', result_status: 'confirmed',
      }];
      if (path === 'rpc/matrix_watchdog_chain_state') return {
        latestPeriod: period,
        analysisComplete: true,
        matrixStatusComplete: true,
        cardComplete: true,
        analysis: {
          drawPeriod: period, status: 'complete',
          startedAt: '2026-09-04T12:34:00.000Z',
          updatedAt: '2026-09-04T12:40:00.000Z',
          leaseExpiresAt: null,
          requiredOrders: ['sorted', 'draw'],
          activeVersions: {
            sorted: `${period}:matrix-python-v14-sorted`,
            draw: `${period}:matrix-python-v14-draw`,
          },
        },
      };
      throw new Error(`unexpected watchdog query: ${path}`);
    });

    const snapshots = await createSupabaseWatchdogSnapshotLoader({ supabaseRequest: request })(
      new Date('2026-09-04T12:43:00.000Z'),
    );

    expect(snapshots.find(snapshot => snapshot.lottery === '今彩539')?.latestAnalysis).toMatchObject({
      drawPeriod: period, status: 'complete',
      updatedAt: '2026-09-04T12:40:00.000Z',
    });
    expect(request.mock.calls.filter(([path]) => path === 'rpc/matrix_watchdog_chain_state')).toHaveLength(4);
    expect(request.mock.calls.some(([path]) => path === 'rpc/matrix_watchdog_analysis_state')).toBe(false);
  });
  it('treats current split v14 active analyses as complete instead of analysis-missing', async () => {
    const period = '115000215';
    const supabaseRequest = vi.fn(async (path: string) => {
      if (path === 'rpc/matrix_watchdog_draw_days') {
        return {
          今彩539: ['2026-09-04', '2026-09-05'],
          天天樂: ['2026-09-03', '2026-09-04', '2026-09-05'],
         六合彩: ['2026-09-03', '2026-09-05'],
          大樂透: ['2026-09-04'],
        };
      }
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
      if (path === 'rpc/matrix_watchdog_chain_state') throw new Error('chain temporarily unavailable');
      throw new Error(`unexpected watchdog query: ${path}`);
    });

    const load = createSupabaseWatchdogSnapshotLoader({ supabaseRequest });
    const checkedAt = new Date('2026-09-04T12:43:00.000Z');
    const snapshots = await load(checkedAt);
    const snapshot = snapshots.find((item) => item.lottery === '今彩539');

    expect(snapshot?.latestAnalysis).toMatchObject({
      drawPeriod: period,
      status: 'complete',
    });
    expect(supabaseRequest.mock.calls.findIndex(([path]) => path === 'rpc/matrix_watchdog_chain_state'))
      .toBeLessThan(supabaseRequest.mock.calls.findIndex(([path]) => path === 'rpc/matrix_watchdog_analysis_state'));
    expect(snapshot?.unavailable).toBe(false);
    expect(snapshot?.drawDays).toContain('2026-09-04');
    expect(supabaseRequest.mock.calls.some(([path]) => String(path).includes('matrix-python-v12'))).toBe(false);
    expect(planWatchdogActions(snapshot ? [snapshot] : [], checkedAt)).toEqual([]);
  });
});
