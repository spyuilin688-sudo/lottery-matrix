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

const account = {
  paymentDate: '2026-10-01', paymentDateNote: '官方帳務頁顯示', paymentAmount: 'US$14.08', paymentKind: 'estimate', paymentNote: '折抵後預估，尚未結帳',
  costs: [{ label: '固定費用', value: 'US$20／月', note: '含用量額度' }],
  quotas: [{ label: 'CPU', included: '100 小時', used: '20 小時', remaining: '80 小時', reset: '2026-10-01' }],
  verifiedAt: '2026-09-26T00:00:00Z', source: '官方 Billing 頁人工核對',
};
const accountRow = (value: unknown) => ({ provider: 'railway', plan: 'Pro', fee: null, renewal_date: null, verified_at: null, billing_snapshot: { source: 'API', verifiedAt: '2026-09-26T01:00:00Z', account: value } });

it('allowlists verified account, cost and quota fields without exposing nested private data', async () => {
  const input = { ...account, privateUrl: 'secret', costs: [{ ...account.costs[0], token: 'secret' }], quotas: [{ ...account.quotas[0], token: 'secret' }] };
  const result = await createArchitectureOverview({ selectRows: async () => [accountRow(input)] }).get();
  expect(result.items[0].billing?.account).toEqual(account);
  expect(JSON.stringify(result)).not.toContain('secret');
  const empty = await createArchitectureOverview({ selectRows: async () => [accountRow(null)] }).get();
  expect(empty.items[0].billing?.account).toBeNull();
});

it('rejects malformed optional account snapshots and nested rows', async () => {
  const invalid = [undefined, [], {}, { ...account, paymentDate: '2026-02-30' }, { ...account, paymentKind: 'paid' }, { ...account, paymentKind: ['due'] },
    { ...account, verifiedAt: '' }, { ...account, paymentAmount: 0 }, { ...account, paymentNote: 'x'.repeat(201) },
    { ...account, costs: Array(31).fill(account.costs[0]) }, { ...account, costs: [{ label: 'Fee', value: 0 }] },
    { ...account, quotas: [{ ...account.quotas[0], remaining: null }] }, { ...account, quotas: [{ ...account.quotas[0], note: {} }] }];
  for (const value of invalid) {
    await expect(createArchitectureOverview({ selectRows: async () => [accountRow(value)] }).get()).rejects.toThrow();
  }
});


it('exposes automatic limits separately from manual account data and validates them',async()=>{
 const limits=[{label:'同時建置',value:'1 個'}];
 const input={...accountRow(account),provider:'cloudflare',billing_snapshot:{source:'Cloudflare API',verifiedAt:'2026-09-26T00:00:00Z',limits:[{...limits[0],secret:'hidden'}],account}};
 const r=await createArchitectureOverview({selectRows:async()=>[input]}).get();
 expect(r.items[0].billing?.limits).toEqual(limits);
 expect(r.items[0].billing?.account).toEqual(account);
 expect(JSON.stringify(r)).not.toContain('hidden');
 for(const invalid of [null,[{label:'上限',value:0}],Array(31).fill(limits[0])]) await expect(createArchitectureOverview({selectRows:async()=>[{...input,billing_snapshot:{...input.billing_snapshot,limits:invalid}}]}).get()).rejects.toThrow();
});

it('allowlists automatic usage and original historical payment provenance',async()=>{
 const usageBreakdown=[{label:'CPU',quantity:'100 vCPU·分鐘',grossAmount:'US$1.0000',discountAmount:null,netAmount:null}];
 const manualPayment={paymentDate:'2026-08-26',amount:'US$20.00',verifiedAt:'2026-09-25T00:00:00Z',source:'已核對付款'};
 const r={...accountRow(account),billing_snapshot:{...accountRow(account).billing_snapshot,pendingAmount:'US$18.00',usageBreakdown:[{...usageBreakdown[0],token:'secret'}],manualPayment:{...manualPayment,privateUrl:'secret'},manualInvoiceVerifiedAt:'2026-09-25T00:00:00Z'}};
 const result=(await createArchitectureOverview({selectRows:async()=>[r]}).get()).items[0].billing;
 expect(result?.usageBreakdown).toEqual(usageBreakdown);expect(result?.pendingAmount).toBe('US$18.00');expect(result?.manualPayment).toEqual(manualPayment);expect(JSON.stringify(result)).not.toContain('secret');
 for(const bad of [{usageBreakdown:[{...usageBreakdown[0],quantity:4}]},{manualPayment:{...manualPayment,paymentDate:'2026-02-30'}},{pendingAmount:3}]) await expect(createArchitectureOverview({selectRows:async()=>[{...r,billing_snapshot:{...r.billing_snapshot,...bad}}]}).get()).rejects.toThrow();
});
