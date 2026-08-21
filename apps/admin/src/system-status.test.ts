import { describe, expect, it, vi } from 'vitest';
import { loadSystemStatus } from './system-status';

describe('system status client', () => {
  it('loads the system status endpoint', async () => {
    const get = vi.fn(async () => ({ data: { checkedAt: '2026-08-21T03:00:00Z', items: [] } }));
    await expect(loadSystemStatus({ get })).resolves.toEqual({ checkedAt: '2026-08-21T03:00:00Z', items: [] });
    expect(get).toHaveBeenCalledWith('/api/system-status');
  });
});
