import type { QuotaEvidence, QuotaOrder } from '../_shared/ecpay-quota.ts';

export type CheckoutOrder = { merchantTradeNo: string; planName: string; amount: number };
export type QuotaInput = { memberId: string; planCode: string; merchantTradeNo: string; merchantId: string };
export type QuotaResult = CheckoutOrder | { manual: true };
type Dependencies = { create(input: QuotaInput): Promise<CheckoutOrder>; reconcile(): Promise<void> };

export async function reconcileQuotaBatch(orders: QuotaOrder[], dependencies: {
  query(order: QuotaOrder): Promise<QuotaEvidence>;
  record(evidence: QuotaEvidence): Promise<void>;
  backoff(): Promise<void>;
}): Promise<void> {
  const failures: unknown[] = [];
  for (const order of orders) {
    try { await dependencies.record(await dependencies.query(order)); }
    catch (error) {
      if (error instanceof Error && error.message === 'ECPAY_QUERY_RATE_LIMITED') {
        await dependencies.backoff();
        throw error;
      }
      // One unresolved order must not starve the rest of the claimed batch.
      failures.push(error);
    }
  }
  if (failures.length) throw failures[0];
}

export async function createOrderWithQuota(input: QuotaInput, dependencies: Dependencies): Promise<QuotaResult> {
  for (let attempt=0; attempt<2; attempt++) {
    try { return await dependencies.create(input); }
    catch (error) {
      if (error instanceof Error && error.message === 'ECPAY_QUOTA_LIMIT') return { manual: true };
      if (!(error instanceof Error) || error.message !== 'ECPAY_QUOTA_UNCERTAIN' || attempt !== 0) throw error;
      await dependencies.reconcile();
    }
  }
  throw new Error('ECPAY_QUOTA_UNCERTAIN');
}
