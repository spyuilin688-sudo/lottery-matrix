import { expect, it, vi } from 'vitest';
import { createArchitectureOverview } from './architecture-overview';

it('only exposes subscription fields and preserves unknown fees and renewal dates', async () => {
  const selectRows = vi.fn(async () => [
    { provider: 'railway', plan: 'Pro', fee: 'US$20／月', renewal_date: null, verified_at: '2026-09-25T20:00:00Z', token: 'not-for-client' },
  ]);
  const result = await createArchitectureOverview({ selectRows }).get();
  expect(result).toEqual({ items: [{ provider: 'railway', plan: 'Pro', fee: 'US$20／月', renewalDate: null, verifiedAt: '2026-09-25T20:00:00Z', billing: null }] });
  expect(selectRows).toHaveBeenCalledWith('admin_architecture_subscriptions', 'select=provider,plan,fee,renewal_date,verified_at,billing_snapshot&order=provider&limit=4');
});

it('keeps paid invoices, current charges and estimates separate and rejects unverified billing data', async () => {
  const billing = { latestInvoiceAmount: 'US$37.12', latestInvoiceStatus: 'paid', latestPaymentDate: '2024-02-01', currentAmount: 'US$13.47', estimatedAmount: 'US$14.08', period: '2/1－3/1', source: 'Railway 工作區 Billing / Usage、Stripe 付款頁', verifiedAt: '2024-02-15T00:00:00Z' };
  const row = { provider: 'railway', plan: 'Pro', fee: 'US$20／月', renewal_date: null, verified_at: billing.verifiedAt, billing_snapshot: { ...billing, privatePaymentUrl: 'must-not-leak' } };
  const result = await createArchitectureOverview({ selectRows: async () => [row] }).get();
  expect(result.items[0].billing).toEqual(billing);
  expect(result.items[0].renewalDate).toBeNull();
  const partial = await createArchitectureOverview({ selectRows: async () => [{ ...row, billing_snapshot: { source: billing.source, verifiedAt: billing.verifiedAt } }] }).get();
  expect(partial.items[0].billing).toEqual({ latestInvoiceAmount: null, latestInvoiceStatus: null, latestPaymentDate: null, currentAmount: null, estimatedAmount: null, period: null, source: billing.source, verifiedAt: billing.verifiedAt });
  for (const invalid of [{ ...billing, verifiedAt: null }, { ...billing, latestPaymentDate: '2026-02-30' }, { ...billing, latestInvoiceStatus: 'guessed' }]) {
    await expect(createArchitectureOverview({ selectRows: async () => [{ ...row, billing_snapshot: invalid }] }).get()).rejects.toThrow();
  }
});

it('does not disguise storage failures or malformed data as confirmed empty subscriptions', async () => {
  await expect(createArchitectureOverview({ selectRows: async () => { throw new Error('offline'); } }).get()).rejects.toThrow();
  await expect(createArchitectureOverview({ selectRows: async () => [{ provider: 'unknown' }] }).get()).rejects.toThrow();
});
