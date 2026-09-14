type Dependencies = {
  recordVisit(source: string): Promise<void>;
};

const ALLOWED_ORIGINS = new Set([
  'https://matrixlottery.idv.tw',
]);

function responseHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
}

function clientIp(request: Request) {
  const forwarded = request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim();
  return forwarded
    || request.headers.get('CF-Connecting-IP')?.trim()
    || request.headers.get('X-Real-IP')?.trim()
    || '';
}

export function createVisitorVisitHandler({ recordVisit }: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('Origin')?.trim() ?? '';
    if (!ALLOWED_ORIGINS.has(origin)) {
      return Response.json({ error: { code: 'ORIGIN_NOT_ALLOWED' } }, { status: 403 });
    }
    const headers = responseHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') {
      return Response.json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405, headers });
    }

    const ip = clientIp(request);
    if (!ip || ip.length > 128) {
      return Response.json({ error: { code: 'VISITOR_SOURCE_UNAVAILABLE' } }, { status: 400, headers });
    }
    try {
      await recordVisit(ip);
      return new Response(null, { status: 204, headers });
    } catch {
      return Response.json({ error: { code: 'VISITOR_RECORD_FAILED' } }, { status: 503, headers });
    }
  };
}
