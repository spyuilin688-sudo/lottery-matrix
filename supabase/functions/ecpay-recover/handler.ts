import { reconcileQuotaBatch } from '../ecpay-checkout/quota.ts';
import type { QuotaEvidence, QuotaOrder } from '../_shared/ecpay-quota.ts';

type Dependencies = {
  token: string;
  claim(): Promise<QuotaOrder[]>;
  query(order: QuotaOrder): Promise<QuotaEvidence>;
  record(evidence: QuotaEvidence): Promise<void>;
  backoff(): Promise<void>;
};

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length,b.length); i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

export function createEcpayRecoveryHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return new Response('METHOD_NOT_ALLOWED',{ status: 405 });
    const token = request.headers.get('x-matrix-dispatch-token') ?? '';
    if (!token) return new Response('AUTH_REQUIRED',{ status: 401 });
    if (!dependencies.token || !constantTimeEqual(token,dependencies.token)) {
      return new Response('INVALID_TOKEN',{ status: 403 });
    }
    try {
      const orders = await dependencies.claim();
      await reconcileQuotaBatch(orders,dependencies);
      return new Response('OK',{ status: 200 });
    } catch {
      return new Response('RETRY',{ status: 503 });
    }
  };
}
