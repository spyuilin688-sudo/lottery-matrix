type Dependencies = {
  recordVisit(source: string): Promise<void>;
  recordIntroVisit?(source: string): Promise<void>;
  readIntroStats?(): Promise<unknown>;
};

const ALLOWED_ORIGINS = new Set([
  'https://matrixlottery.idv.tw',
  'https://supabasemax.spyuilin688.chatgpt.site',
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

function clientIp(request: Request, introVisit: boolean) {
  const forwarded = request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim();
  const gateway = request.headers.get('CF-Connecting-IP')?.trim();
  if (introVisit && gateway) return gateway;
  return forwarded
    || gateway
    || request.headers.get('X-Real-IP')?.trim()
    || '';
}

function isVisitorCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function createVisitorVisitHandler({ recordVisit, recordIntroVisit, readIntroStats }: Dependencies) {
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

    const introVisit = new URL(request.url).searchParams.get('stats') === '1';
    const ip = clientIp(request, introVisit);
    if (!ip || ip.length > 128) {
      return Response.json({ error: { code: 'VISITOR_SOURCE_UNAVAILABLE' } }, { status: 400, headers });
    }
    try {
      if (introVisit) {
        if (!recordIntroVisit) throw new Error('INTRO_VISITOR_RECORDER_UNAVAILABLE');
        await recordIntroVisit(ip);
      } else {
        await recordVisit(ip);
      }
    } catch {
      return Response.json({ error: { code: 'VISITOR_RECORD_FAILED' } }, { status: 503, headers });
    }

    if (!introVisit) {
      return new Response(null, { status: 204, headers });
    }
    try {
      if (!readIntroStats) throw new Error('VISITOR_STATS_UNAVAILABLE');
      const stats = await readIntroStats() as Record<string, unknown> | null;
      const todayVisitors = stats?.todayVisitors;
      const totalVisitors = stats?.totalVisitors;
      if (!isVisitorCount(todayVisitors) || !isVisitorCount(totalVisitors)) {
        throw new Error('VISITOR_STATS_INVALID');
      }
      return Response.json({ todayVisitors, totalVisitors }, { status: 200, headers });
    } catch {
      return Response.json({ error: { code: 'VISITOR_STATS_UNAVAILABLE' } }, { status: 503, headers });
    }
  };
}
