import { describe, expect, it, vi } from 'vitest';
import {
  canRefreshCrawler,
  loadSystemStatus,
  refreshCrawlerSystemStatus,
  retrySystemStatus,
} from './system-status';

describe('system status client', () => {
  it('loads the system status endpoint', async () => {
    const get = vi.fn(async () => ({ data: { checkedAt: '2026-08-21T03:00:00Z', items: [] } }));
    await expect(loadSystemStatus({ get })).resolves.toEqual({ checkedAt: '2026-08-21T03:00:00Z', items: [] });
    expect(get).toHaveBeenCalledWith('/api/system-status');
  });

  it('requests a real retry for one abnormal API item', async () => {
    const item = {
      id: 'railway-worker-api',
      name: 'Matrix audit API',
      description: '檢查開獎資料',
      ok: true,
      checkedAt: '2026-08-21T03:01:00Z',
      responseMs: 23,
    };
    const post = vi.fn(async () => ({ data: { item } }));

    await expect(retrySystemStatus({ post }, 'railway-worker-api')).resolves.toEqual(item);
    expect(post).toHaveBeenCalledWith('/api/system-status/railway-worker-api/retry');
  });

  it('requests the selected failed crawler status item to refresh its latest draw', async () => {
    const refresh = {
      lottery: '今彩539',
      period: '115000211',
      drawDate: '2026-09-01',
    };
    const post = vi.fn(async () => ({ data: { refresh } }));

    await expect(refreshCrawlerSystemStatus({ post }, 'cron-matrix-539-refresh-v2')).resolves.toEqual(refresh);
    expect(post).toHaveBeenCalledWith('/api/system-status/cron-matrix-539-refresh-v2/refresh');
  });

  it('offers manual refresh only to an editor for an abnormal stopped crawler', () => {
    const crawler = {
      id: 'cron-matrix-539-refresh-v2',
      name: '今彩539 開獎資料',
      description: '檢查最新開獎資料',
      ok: false,
      checkedAt: '2026-09-01T00:00:00Z',
      responseMs: 12,
      detail: { lottery: '今彩539', status: 'failed' },
    };

    expect(canRefreshCrawler(crawler, true)).toBe(true);
    expect(canRefreshCrawler(crawler, false)).toBe(false);
    expect(canRefreshCrawler({ ...crawler, ok: true }, true)).toBe(false);
    expect(canRefreshCrawler({ ...crawler, detail: { lottery: '今彩539', status: 'running' } }, true)).toBe(false);
    expect(canRefreshCrawler({ ...crawler, detail: null }, true)).toBe(true);
    expect(canRefreshCrawler({ ...crawler, detail: {} }, true)).toBe(false);
    expect(canRefreshCrawler({ ...crawler, detail: { lottery: '今彩539', status: 'unknown' } }, true)).toBe(false);
  });
});
