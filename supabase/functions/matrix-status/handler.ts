import { createMatrixStatusRoutes } from '../../../backend/matrix-status-routes.ts';
import type { MatrixPublicResultRevisions } from './source-reader.ts';

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

export function createMatrixStatusEdgeHandler(
  dependencies: MatrixStatusDependencies,
  readPublicResultRevision?: () => Promise<MatrixPublicResultRevisions>,
) {
  const routes = createMatrixStatusRoutes(dependencies);
  type SummaryResult = Awaited<ReturnType<typeof routes.summary>>;
  const summaries = new Map<MatrixLottery, { version: string; result: SummaryResult }>();

  const revision = async () => {
    try { return await readPublicResultRevision?.() ?? null; }
    catch { return null; } // Old deployments continue through the original read path.
  };

  const readSummaries = async (requested: MatrixLottery[], authorization: string | undefined) => {
    let versions = dependencies.readCompactStatus ? await revision() : null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let loaded = false;
      const items = await Promise.all(requested.map(async (lottery) => {
        const key = versions ? JSON.stringify(versions[lottery]) : null;
        const stored = key ? summaries.get(lottery) : null;
        if (stored && stored.version === key) {
          return { lottery, status: stored.result.status, body: stored.result.body };
        }
        loaded = true;
        const result = await routes.summary({ authorization, body: { lottery } });
        return { lottery, status: result.status, body: result.body };
      }));
      if (!versions || !loaded) return items;

      const after = await revision();
      if (!after) return items;
      if (requested.some((lottery) => JSON.stringify(after[lottery]) !== JSON.stringify(versions[lottery]))) {
        versions = after;
        if (attempt === 0) continue; // Retry a draw that changed during the cold load.
        return items;
      }
      for (const item of items) {
        const body = record(item.body);
        if (item.status === 200 && body?.kind === 'status-summary' && body.lottery === item.lottery
          && typeof body.drawPeriod === 'string' && body.drawPeriod) {
          summaries.set(item.lottery, {
            version: JSON.stringify(versions[item.lottery]),
            result: { status: item.status, body: item.body },
          });
        }
      }
      return items;
    }
    throw new Error('UNREACHABLE_STATUS_BATCH');
  };
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
        requested.length === 0
        || requested.length > lotteries.length
        || new Set(requested).size !== requested.length
        || requested.some((item) => !lotteries.includes(item as MatrixLottery))
        || (action === 'batch' && requested.length !== lotteries.length)
      ) {
        return json({ error: { code: 'INVALID_REQUEST' } }, 400);
      }
      const items = action === 'summary-batch'
        ? await readSummaries(requested as MatrixLottery[], authorization)
        : await Promise.all(requested.map(async (item) => {
          const lottery = item as MatrixLottery;
          const result = await routes.get({ authorization, body: { lottery } });
          return { lottery, status: result.status, body: result.body };
        }));
      return json({
        kind: action === 'summary-batch' ? 'status-summary-batch' : 'status-batch',
        items,
      }, 200);
    }

    const route = action === 'identity' ? routes.identity : action === 'validation' ? routes.validation : routes.get;
    const result = await route({
      authorization,
      body,
    });
    return json(result.body, result.status);
  };
}
