import { createMatrixStatusRoutes } from '../../../backend/matrix-status-routes.ts';

type MatrixStatusDependencies = Parameters<typeof createMatrixStatusRoutes>[0];

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
    const result = await routes.get({
      authorization: request.headers.get('authorization') ?? undefined,
      body,
    });
    return json(result.body, result.status);
  };
}
