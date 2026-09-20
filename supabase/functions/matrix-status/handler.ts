import { createMatrixStatusRoutes } from '../../../backend/matrix-status-routes.ts';

type MatrixStatusDependencies = Parameters<typeof createMatrixStatusRoutes>[0];
type MatrixLottery = '今彩539' | '天天樂' | '六合彩' | '大樂透';

const lotteries: MatrixLottery[] = ['今彩539', '天天樂', '六合彩', '大樂透'];
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(value: unknown, status: number) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function record(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function createMatrixStatusEdgeHandler(dependencies: MatrixStatusDependencies) {
  const routes = createMatrixStatusRoutes(dependencies);
  return async (request: Request) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== 'POST') {
      return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: { code: 'INVALID_REQUEST' } }, 400);
    }
    const value = record(body);
    const action = value ? String(value.action ?? '') : '';
    const authorization = request.headers.get('authorization') ?? undefined;

    if (['custom-save', 'custom-reset', 'recompute'].includes(action)) {
      return json({ error: { code: 'CUSTOM_STATUS_RETIRED' } }, 410);
    }

    if (action === 'batch' || action === 'summary-batch') {
      const requested = Array.isArray(value?.lotteries)
        ? value.lotteries.map((item) => String(item))
        : [];
      if (
        requested.length !== lotteries.length
        || new Set(requested).size !== requested.length
        || requested.some((item) => !lotteries.includes(item as MatrixLottery))
      ) {
        return json({ error: { code: 'INVALID_REQUEST' } }, 400);
      }
      const items = await Promise.all(requested.map(async (item) => {
        const lottery = item as MatrixLottery;
        const route = action === 'summary-batch' ? routes.summary : routes.get;
        const result = await route({
          authorization,
          body: { lottery },
        });
        return { lottery, status: result.status, body: result.body };
      }));
      return json({
        kind: action === 'summary-batch' ? 'status-summary-batch' : 'status-batch',
        items,
      }, 200);
    }

    const route = action === 'validation' ? routes.validation : routes.get;
    const result = await route({
      authorization,
      body,
    });
    return json(result.body, result.status);
  };
}
