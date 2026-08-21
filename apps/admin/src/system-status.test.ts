import { describe, expect, it, vi } from 'vitest';
import { loadSystemStatus, retrySystemStatus } from './system-status';

describe('system status client', () => {
  it('loads the system status endpoint', async () => {
    const get = vi.fn(async () => ({ data: { checkedAt: '2026-08-21T03:00:00Z', items: [] } }));
    await expect(loadSystemStatus({ get })).resolves.toEqual({ checkedAt: '2026-08-21T03:00:00Z', items: [] });
    expect(get).toHaveBeenCalledWith('/api/system-status');
  });

  it('requests a real retry for one abnormal API item', async () => {
    const item = {
      id: 'matrix-audit-api',
      name: 'Matrix audit API',
      description: '檢查開獎資料',
      ok: true,
      checkedAt: '2026-08-21T03:01:00Z',
      responseMs: 23,
    };
    const post = vi.fn(async () => ({ data: { item } }));

    await expect(retrySystemStatus({ post }, 'matrix-audit-api')).resolves.toEqual(item);
    expect(post).toHaveBeenCalledWith('/api/system-status/matrix-audit-api/retry');
  });
});
