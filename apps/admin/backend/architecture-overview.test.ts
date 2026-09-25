import { expect, it, vi } from 'vitest';
import { createArchitectureOverview } from './architecture-overview';

it('only exposes subscription fields and preserves unknown fees and renewal dates', async () => {
  const selectRows = vi.fn(async () => [
    { provider: 'railway', plan: 'Pro', fee: 'US$20／月', renewal_date: null, verified_at: '2026-09-25T20:00:00Z', token: 'not-for-client' },
  ]);
  const result = await createArchitectureOverview({ selectRows }).get();
  expect(result).toEqual({ items: [{ provider: 'railway', plan: 'Pro', fee: 'US$20／月', renewalDate: null, verifiedAt: '2026-09-25T20:00:00Z' }] });
  expect(selectRows).toHaveBeenCalledWith('admin_architecture_subscriptions', 'select=provider,plan,fee,renewal_date,verified_at&order=provider&limit=4');
});

it('does not disguise storage failures or malformed data as confirmed empty subscriptions', async () => {
  await expect(createArchitectureOverview({ selectRows: async () => { throw new Error('offline'); } }).get()).rejects.toThrow();
  await expect(createArchitectureOverview({ selectRows: async () => [{ provider: 'unknown' }] }).get()).rejects.toThrow();
});
