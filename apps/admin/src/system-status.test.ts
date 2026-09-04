import { describe, expect, it, vi } from 'vitest';
import {
  canRefreshCrawler,
  canRetrySystemStatus,
  getGithubStatusFacts,
  groupSystemStatusItems,
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
      id: 'railway-health',
      name: 'Matrix audit API',
      description: '檢查開獎資料',
      group: '系統',
      location: 'Railway' as const,
      endpoint: '/health',
      checkMode: 'live' as const,
      ok: true,
      checkedAt: '2026-08-21T03:01:00Z',
      responseMs: 23,
    };
    const post = vi.fn(async () => ({ data: { item } }));

    await expect(retrySystemStatus({ post }, 'railway-health')).resolves.toEqual(item);
    expect(post).toHaveBeenCalledWith('/api/system-status/railway-health/retry');
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
      group: '排程',
      location: 'Supabase' as const,
      endpoint: '/rest/v1/system_job_status',
      checkMode: 'live' as const,
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

  it('groups status rows in the fixed deployment-location order', () => {
    const item = (id: string, location: 'AppDeploy' | 'Supabase' | 'GitHub' | 'Railway') => ({
      id,
      name: id,
      description: '狀態',
      group: '系統',
      location,
      endpoint: '/health',
      checkMode: 'live' as const,
      ok: true,
      checkedAt: '2026-09-02T00:00:00Z',
      responseMs: 1,
    });

    expect(groupSystemStatusItems([
      item('railway', 'Railway'),
      item('github', 'GitHub'),
      item('supabase', 'Supabase'),
      item('admin', 'AppDeploy'),
    ])).toEqual([
      { location: 'AppDeploy', items: [expect.objectContaining({ id: 'admin' })] },
      { location: 'Supabase', items: [expect.objectContaining({ id: 'supabase' })] },
      { location: 'GitHub', items: [expect.objectContaining({ id: 'github' })] },
      { location: 'Railway', items: [expect.objectContaining({ id: 'railway' })] },
    ]);
  });

  it('omits deployment locations that do not have status rows', () => {
    const item = (id: string, location: 'AppDeploy' | 'GitHub' | 'Railway') => ({
      id,
      name: id,
      description: '狀態',
      group: '系統',
      location,
      endpoint: '/health',
      checkMode: 'live' as const,
      ok: true,
      checkedAt: '2026-09-02T00:00:00Z',
      responseMs: 1,
    });

    expect(groupSystemStatusItems([
      item('railway', 'Railway'),
      item('admin', 'AppDeploy'),
      item('github', 'GitHub'),
    ]).map((group) => group.location)).toEqual(['AppDeploy', 'GitHub', 'Railway']);
  });

  it('projects the whitelisted GitHub workflow and latest-run detail for display', () => {
    const github = {
      id: 'github-fantasy5-workflow',
      name: '天天樂 GitHub Actions 爬蟲',
      description: '唯讀確認 workflow 與最近一次執行狀態。',
      group: '排程',
      location: 'GitHub' as const,
      endpoint: '/repos/example/actions/workflows/fantasy5-crawler.yml',
      checkMode: 'live' as const,
      ok: true,
      checkedAt: '2026-09-04T12:00:00Z',
      responseMs: 14,
      detail: {
        workflow: {
          name: 'Fantasy5 crawler',
          path: '.github/workflows/fantasy5-crawler.yml',
          state: 'active',
        },
        latestRun: {
          status: 'completed',
          conclusion: 'failure',
          createdAt: '2026-09-04T11:40:00Z',
          updatedAt: '2026-09-04T11:42:00Z',
        },
      },
    };

    expect(getGithubStatusFacts(github)).toEqual([
      { label: 'Workflow 名稱', value: 'Fantasy5 crawler' },
      { label: 'Workflow 路徑', value: '.github/workflows/fantasy5-crawler.yml' },
      { label: 'Workflow 狀態', value: 'active' },
      { label: '最近執行狀態', value: 'completed' },
      { label: '最近執行結果', value: 'failure' },
      { label: '最近執行建立時間', value: '2026-09-04T11:40:00Z', format: 'date' },
      { label: '最近執行更新時間', value: '2026-09-04T11:42:00Z', format: 'date' },
    ]);
    expect(canRetrySystemStatus({ ...github, ok: false })).toBe(false);
    expect(canRefreshCrawler({ ...github, ok: false }, true)).toBe(false);
    expect(canRefreshCrawler({ ...github, id: 'cron-matrix-539-refresh-v2', ok: false, detail: null }, true)).toBe(false);
  });

  it('shows a clear state when GitHub has no workflow run history', () => {
    const github = {
      id: 'github-fantasy5-workflow',
      name: '天天樂 GitHub Actions 爬蟲',
      description: '唯讀確認 workflow 與最近一次執行狀態。',
      group: '排程',
      location: 'GitHub' as const,
      endpoint: '/repos/example/actions/workflows/fantasy5-crawler.yml',
      checkMode: 'live' as const,
      ok: true,
      checkedAt: '2026-09-04T12:00:00Z',
      responseMs: 14,
      detail: {
        workflow: { name: 'Fantasy5 crawler', path: '.github/workflows/fantasy5-crawler.yml', state: 'active' },
        latestRun: null,
      },
    };

    expect(getGithubStatusFacts(github)).toEqual([
      { label: 'Workflow 名稱', value: 'Fantasy5 crawler' },
      { label: 'Workflow 路徑', value: '.github/workflows/fantasy5-crawler.yml' },
      { label: 'Workflow 狀態', value: 'active' },
      { label: '最近執行', value: '尚無執行紀錄' },
    ]);
  });
});
