type PagesContext = {
  request: Request;
  env: Record<string, unknown>;
};

const ADMIN_API_PREFIX = '/admin/api';
const SUPABASE_ADMIN_API = 'https://wcimzbbapfrdotjsfyxa.supabase.co/functions/v1/admin-api';
const MAX_BODY_BYTES = 65_536;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const REQUEST_HEADERS = ['accept', 'authorization', 'content-type', 'cookie', 'user-agent'] as const;
const RESPONSE_HEADERS = ['cache-control', 'content-type', 'retry-after', 'x-content-type-options'] as const;
const ADMIN_SESSION_COOKIE_PREFIX = 'matrix_admin_session=';

type HeadersWithSetCookie = Headers & { getSetCookie?: () => string[] };

function adminSessionCookie(headers: Headers): string | null {
  const getSetCookie = (headers as HeadersWithSetCookie).getSetCookie;
  const values = typeof getSetCookie === 'function'
    ? getSetCookie.call(headers)
    : [headers.get('set-cookie') ?? ''];
  for (const value of values) {
    const cookie = value
      .split(/,\s*(?=[A-Za-z0-9_-]+=)/)
      .map((candidate) => candidate.trim())
      .find((candidate) => candidate.startsWith(ADMIN_SESSION_COOKIE_PREFIX));
    if (cookie) return cookie;
  }
  return null;
}

function proxyError(code: string, status: number) {
  return Response.json({ error: code }, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

export function createAdminApiProxy(fetcher: typeof fetch = fetch) {
  return async (request: Request, _env: Record<string, unknown>): Promise<Response> => {
    const incoming = new URL(request.url);
    if (!incoming.pathname.startsWith(`${ADMIN_API_PREFIX}/`)) return proxyError('NOT_FOUND', 404);

    const origin = request.headers.get('origin');
    if (!SAFE_METHODS.has(request.method) && origin !== incoming.origin) {
      return proxyError('ORIGIN_NOT_ALLOWED', 403);
    }

    const upstream = new URL(`${SUPABASE_ADMIN_API}/api${incoming.pathname.slice(ADMIN_API_PREFIX.length)}`);
    upstream.search = incoming.search;
    const headers = new Headers();
    for (const name of REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    if (origin !== null) headers.set('origin', origin);
    const visitorIp = request.headers.get('cf-connecting-ip');
    if (visitorIp) headers.set('x-forwarded-for', visitorIp);

    try {
      let body: ArrayBuffer | undefined;
      if (!SAFE_METHODS.has(request.method)) {
        const declaredLength = request.headers.get('content-length');
        if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)) {
          return proxyError('REQUEST_BODY_TOO_LARGE', 413);
        }
        const bytes = await request.arrayBuffer();
        if (bytes.byteLength > MAX_BODY_BYTES) return proxyError('REQUEST_BODY_TOO_LARGE', 413);
        body = bytes.byteLength > 0 ? bytes : undefined;
      }
      const response = await fetcher(upstream.href, {
        method: request.method,
        headers,
        body,
        redirect: 'manual',
      });
      const responseHeaders = new Headers();
      for (const name of RESPONSE_HEADERS) {
        const value = response.headers.get(name);
        if (value !== null) responseHeaders.set(name, value);
      }
      const cookie = adminSessionCookie(response.headers);
      if (cookie) responseHeaders.set('Set-Cookie', cookie);
      responseHeaders.set('Cache-Control', 'no-store');
      responseHeaders.set('X-Content-Type-Options', 'nosniff');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch {
      return proxyError('ADMIN_API_UNAVAILABLE', 503);
    }
  };
}

const proxy = createAdminApiProxy();

export const onRequest = (context: PagesContext) => proxy(context.request, context.env);
