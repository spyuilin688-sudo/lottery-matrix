import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

type RequestConfig = { data?: unknown };
type AdminApiClientOptions = {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  bearerToken?: () => Promise<string | null>;
};

type OwnerSignInInput = { email?: string; password?: string };

export class AdminApiError extends Error {
  readonly status: number;
  readonly statusCode: number;
  readonly response: { status: number };

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.statusCode = status;
    this.response = { status };
  }
}

function adminApiPath(path: string) {
  if (path !== '/api' && !path.startsWith('/api/')) {
    throw new AdminApiError('ADMIN_API_PATH_INVALID', 400);
  }
  return `/admin/api${path.slice('/api'.length)}`;
}

function failureMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'ADMIN_API_REQUEST_FAILED';
  const error = (payload as { error?: unknown }).error;
  if (typeof error === 'string' && error) return error;
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const code = (error as { code?: unknown }).code;
    const message = (error as { message?: unknown }).message;
    if (typeof code === 'string' && code) return code;
    if (typeof message === 'string' && message) return message;
  }
  return 'ADMIN_API_REQUEST_FAILED';
}

export function createAdminApiClient(options: AdminApiClientOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function request(method: string, path: string, body?: unknown) {
    const url = adminApiPath(path);
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new AdminApiError('ADMIN_API_TIMEOUT', 504));
        controller.abort('ADMIN_API_TIMEOUT');
      }, timeoutMs);
    });
    try {
      return await Promise.race([deadline, (async () => {
        const headers = new Headers({ Accept: 'application/json' });
        if (body !== undefined) headers.set('Content-Type', 'application/json');
        const bearer = await options.bearerToken?.();
        if (controller.signal.aborted) throw new AdminApiError('ADMIN_API_TIMEOUT', 504);
        if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
        const response = await fetcher(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'error',
          signal: controller.signal,
        });
        let data: unknown = null;
        if (response.status !== 204) {
          try { data = await response.json(); }
          catch { throw new AdminApiError('ADMIN_API_INVALID_RESPONSE', response.ok ? 503 : response.status); }
        }
        if (!response.ok) throw new AdminApiError(failureMessage(data), response.status);
        return { data };
      })()]);
    } catch (cause) {
      if (cause instanceof AdminApiError) throw cause;
      if (controller.signal.aborted) throw new AdminApiError('ADMIN_API_TIMEOUT', 504);
      throw new AdminApiError('ADMIN_API_UNAVAILABLE', 503);
    } finally {
      clearTimeout(timeout!);
    }
  }

  return {
    get: (path: string) => request('GET', path),
    post: (path: string, body?: unknown) => request('POST', path, body),
    put: (path: string, body?: unknown) => request('PUT', path, body),
    delete: (path: string, config?: RequestConfig) => request('DELETE', path, config?.data),
  };
}

let ownerClient: SupabaseClient | null = null;

async function ownerBearerToken() {
  if (!ownerClient) return null;
  const { data, error } = await ownerClient.auth.getSession().catch(() => {
    throw new AdminApiError('ADMIN_AUTH_SESSION_UNAVAILABLE', 503);
  });
  if (error) throw new AdminApiError('ADMIN_AUTH_SESSION_UNAVAILABLE', 503);
  return data.session?.access_token ?? null;
}

export const api = createAdminApiClient({ bearerToken: ownerBearerToken });

async function getOwnerClient() {
  if (ownerClient) return ownerClient;
  const { data } = await api.get('/api/owner-auth-config') as {
    data: { url?: unknown; publicKey?: unknown };
  };
  if (typeof data.url !== 'string' || !data.url.startsWith('https://')
    || typeof data.publicKey !== 'string' || !data.publicKey) {
    throw new AdminApiError('OWNER_AUTH_CONFIGURATION_UNAVAILABLE', 503);
  }
  ownerClient = createClient(data.url, data.publicKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return ownerClient;
}

function verifiedUser(user: User | null): User {
  if (!user?.email || !user.email_confirmed_at || user.is_anonymous) {
    throw new AdminApiError('VERIFIED_IDENTITY_REQUIRED', 403);
  }
  return user;
}

export const auth = {
  async signIn(input: OwnerSignInInput = {}) {
    const client = await getOwnerClient();
    const existing = await client.auth.getUser();
    if (!existing.error && existing.data.user) return { user: verifiedUser(existing.data.user) };
    const email = input.email?.trim();
    if (!email || !input.password) throw new AdminApiError('OWNER_CREDENTIALS_REQUIRED', 401);
    const { data, error } = await client.auth.signInWithPassword({ email, password: input.password });
    if (error || !data.user) throw new AdminApiError('OWNER_AUTHENTICATION_FAILED', 401);
    return { user: verifiedUser(data.user) };
  },
  async signOut() {
    if (!ownerClient) return;
    const { error } = await ownerClient.auth.signOut({ scope: 'local' });
    if (error) throw new AdminApiError('OWNER_SIGN_OUT_FAILED', 503);
  },
};
