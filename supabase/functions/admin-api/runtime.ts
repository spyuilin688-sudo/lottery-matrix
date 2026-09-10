// Narrow Fetch-runtime seam for the canonical apps/admin/backend modules.
// This adapter never treats forwarding headers as a trusted visitor identity.
export type SdkResponse = { statusCode: number; headers: Record<string, string>; body: string };
export type RuntimeContext = {
  body?: Record<string, unknown>;
  query: Record<string, string>;
  params: Record<string, string>;
  event: { headers: Record<string, string> };
  user?: { email: string; id: string };
};
type Middleware = (ctx: RuntimeContext) => unknown | Promise<unknown>;
type SecretReader = { listSecretNames(): Promise<string[]>; readSecret(name: string): Promise<string | undefined> };
type EdgeGlobals = { Deno: { env: { toObject(): Record<string, string> }; serve(handler: (request: Request) => Promise<Response>): unknown } };
const edge = () => (globalThis as unknown as EdgeGlobals).Deno;
export const ADMIN_ORIGIN = 'https://matrixlottery.idv.tw';
const MAX_BODY_BYTES = 65536;
const WATCHDOG_TABLE = 'matrix-watchdog-status';

export const json = (value: unknown, statusCode = 200): SdkResponse => ({
  statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(value),
});
export const error = (message: string, statusCode = 500) => json({ error: message }, statusCode);

export function createSecrets(load: () => Record<string, string> = () => edge().env.toObject()): SecretReader {
  return {
    async listSecretNames() { return Object.keys(load()); },
    async readSecret(name) { return load()[name]; },
  };
}
export const secrets = createSecrets();

export function apiPath(request: Request): string | null {
  const pathname = new URL(request.url).pathname;
  for (const prefix of ['/functions/v1/admin-api', '/admin-api']) {
    if (pathname.startsWith(`${prefix}/api/`)) return pathname.slice(prefix.length);
  }
  return null;
}

function responseOf(result: SdkResponse): Response {
  const headers = new Headers(result.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(result.statusCode === 204 ? null : result.body, { status: result.statusCode, headers });
}

class InputError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function readBody(request: Request): Promise<Record<string, unknown> | undefined> {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    throw new InputError(413, 'REQUEST_BODY_TOO_LARGE');
  }
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // Reject before cancel: cancel resolves an outstanding read with done=true.
        // Reversing this order can accidentally accept a stalled body as empty.
        reject(new InputError(408, 'REQUEST_BODY_TIMEOUT'));
        void reader.cancel().catch(() => {});
      }, 5000);
    });
    for (;;) {
      const { value, done } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) { void reader.cancel().catch(() => {}); throw new InputError(413, 'REQUEST_BODY_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  if (bytes === 0) return undefined;
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new InputError(415, 'JSON_BODY_REQUIRED');
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(combined)); }
  catch { throw new InputError(400, 'INVALID_JSON_BODY'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError(400, 'INVALID_JSON_BODY');
  return value as Record<string, unknown>;
}

export function router(routes: Record<string, unknown>): (request: Request) => Promise<Response> {
  const entries = Object.entries(routes).map(([key, handlers]) => {
    const [method, path] = key.split(' ');
    return { method, segments: path.split('/'), handlers: handlers as Middleware[] };
  });
  return async (request) => {
    try {
      const path = apiPath(request);
      if (!path) return responseOf(error('NOT_FOUND', 404));
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.get('origin') !== ADMIN_ORIGIN) {
        return responseOf(error('ORIGIN_NOT_ALLOWED', 403));
      }
      let segments: string[];
      try { segments = path.split('/').map(decodeURIComponent); }
      catch { return responseOf(error('INVALID_PATH', 400)); }
      if (segments.some((segment) => /[\/\\\u0000-\u001f\u007f]/.test(segment))) return responseOf(error('INVALID_PATH', 400));
      const matches = entries.filter((entry) => entry.segments.length === segments.length
        && entry.segments.every((part, index) => part.startsWith(':') ? Boolean(segments[index]) : part === segments[index]));
      const route = matches.find((entry) => entry.method === request.method);
      if (!route) return responseOf(error(matches.length ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND', matches.length ? 405 : 404));
      const params: Record<string, string> = {};
      route.segments.forEach((part, index) => { if (part.startsWith(':')) params[part.slice(1)] = segments[index]; });
      const headers: Record<string, string> = {};
      for (const name of ['cookie', 'authorization', 'origin', 'content-type', 'user-agent', 'x-forwarded-for', 'x-matrix-watchdog-token']) {
        const value = request.headers.get(name);
        if (value !== null) headers[name] = value;
      }
      const ctx: RuntimeContext = {
        params, query: Object.fromEntries(new URL(request.url).searchParams),
        event: { headers }, body: await readBody(request),
      };
      for (const middleware of route.handlers) {
        const result = await middleware(ctx);
        if (result !== undefined && result !== null) {
          const response = result as SdkResponse;
          if (!Number.isInteger(response.statusCode) || response.statusCode < 200 || response.statusCode > 599 || typeof response.body !== 'string') {
            throw new Error('INVALID_HANDLER_RESPONSE');
          }
          return responseOf(response);
        }
      }
      return responseOf(error('HANDLER_RESPONSE_UNAVAILABLE', 503));
    } catch (cause) {
      if (cause instanceof InputError) return responseOf(error(cause.message, cause.status));
      // No request bodies, tokens, upstream diagnostics or personal data in logs.
      return responseOf(error('ADMIN_API_UNAVAILABLE', 503));
    }
  };
}

export function requireAuth(options: { secrets?: SecretReader; fetcher?: typeof fetch } = {}): Middleware {
  const reader = options.secrets ?? secrets;
  const fetcher = options.fetcher ?? fetch;
  return async (ctx) => {
    const authorization = ctx.event.headers.authorization;
    if (!authorization || !/^Bearer [^\s]+$/i.test(authorization)) return error('AUTHENTICATION_REQUIRED', 401);
    try {
      const url = (await reader.readSecret('SUPABASE_URL'))?.trim().replace(/\/+$/, '');
      const key = (await reader.readSecret('SUPABASE_SERVICE_ROLE_KEY'))?.trim();
      if (!url || !key) return error('AUTH_CONFIGURATION_UNAVAILABLE', 503);
      const response = await fetcher(`${url}/auth/v1/user`, {
        headers: { apikey: key, authorization }, signal: AbortSignal.timeout(5000), redirect: 'error',
      });
      if (!response.ok) {
        const invalidCredential = response.status === 401 || response.status === 403;
        return error(invalidCredential ? 'AUTHENTICATION_REQUIRED' : 'AUTH_SERVICE_UNAVAILABLE', invalidCredential ? 401 : 503);
      }
      const user = await response.json();
      const provider = user?.app_metadata?.provider;
      if (typeof user?.id !== 'string' || typeof user?.email !== 'string' || !user.email.trim()
        || typeof user.email_confirmed_at !== 'string' || !user.email_confirmed_at
        || user.is_anonymous === true || typeof provider !== 'string' || provider === 'anonymous'
        || !Array.isArray(user.identities) || !user.identities.some((identity: { provider?: unknown }) => identity.provider === provider)) {
        return error('VERIFIED_IDENTITY_REQUIRED', 403);
      }
      // Authorization still happens inside canonical requireAdmin against the DB.
      ctx.user = { id: user.id, email: user.email };
    } catch { return error('AUTH_SERVICE_UNAVAILABLE', 503); }
  };
}

export function createWatchdogDatabase(reader: SecretReader = secrets, fetcher: typeof fetch = fetch) {
  const validTable = (table: string) => { if (table !== WATCHDOG_TABLE) throw new Error('WATCHDOG_STORE_INVALID_REQUEST'); };
  const rpc = async (name: 'read' | 'write', body: Record<string, unknown>) => {
    const url = (await reader.readSecret('SUPABASE_URL'))?.trim().replace(/\/+$/, '');
    const key = (await reader.readSecret('SUPABASE_SERVICE_ROLE_KEY'))?.trim();
    if (!url || !key) throw new Error('WATCHDOG_STORE_UNAVAILABLE');
    try {
      const response = await fetcher(`${url}/rest/v1/rpc/admin_watchdog_status_${name}`, {
        method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(8000), redirect: 'error',
      });
      if (!response.ok) throw new Error('WATCHDOG_STORE_UNAVAILABLE');
      return await response.json();
    } catch { throw new Error('WATCHDOG_STORE_UNAVAILABLE'); }
  };
  return {
    async list<T>(table: string, options: { limit: number }): Promise<{ items: Array<Omit<T, 'id'> & { id: string }> }> {
      validTable(table);
      if (options.limit !== 1) throw new Error('WATCHDOG_STORE_INVALID_REQUEST');
      const row = await rpc('read', {});
      if (row === null) return { items: [] };
      if (!row || typeof row !== 'object' || Array.isArray(row) || row.id !== 'singleton') throw new Error('WATCHDOG_STORE_UNAVAILABLE');
      return { items: [row] };
    },
    async add(table: string, records: Record<string, unknown>[]): Promise<(string | null)[]> {
      validTable(table);
      if (records.length !== 1) throw new Error('WATCHDOG_STORE_INVALID_REQUEST');
      if (await rpc('write', { p_status: records[0] }) !== true) throw new Error('WATCHDOG_STORE_UNAVAILABLE');
      return ['singleton'];
    },
    async update(table: string, updates: { id: string; record: Record<string, unknown> }[]): Promise<boolean[]> {
      validTable(table);
      if (updates.length !== 1 || updates[0].id !== 'singleton') throw new Error('WATCHDOG_STORE_INVALID_REQUEST');
      if (await rpc('write', { p_status: updates[0].record }) !== true) throw new Error('WATCHDOG_STORE_UNAVAILABLE');
      return [true];
    },
  };
}
export const db = createWatchdogDatabase();
