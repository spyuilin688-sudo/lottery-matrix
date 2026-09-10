export type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
};

export type SecretReader = {
  listSecretNames(): Promise<string[]>;
  readSecret(name: string): Promise<string | null | undefined>;
};

export class BackendIntegrationError extends Error {
  code: 'CONFIG_MISSING' | 'UNAVAILABLE';
  statusCode: number;

  constructor(code: 'CONFIG_MISSING' | 'UNAVAILABLE', message: string) {
    super(message);
    this.name = 'BackendIntegrationError';
    this.code = code;
    this.statusCode = 503;
  }
}

class SupabaseDomainError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'SupabaseDomainError';
    this.statusCode = statusCode;
  }
}

const paymentReversalDomainErrors = new Map<string, {
  httpStatus: number;
  messages: readonly string[];
}>([
  ['22023', {
    httpStatus: 400,
    messages: [
      'PAYMENT_ID_REQUIRED',
      'INVALID_PAYMENT_REVERSAL_STATUS',
      'PAYMENT_REVERSAL_REASON_REQUIRED',
      'PAYMENT_REVERSAL_REASON_TOO_LONG',
      'PAYMENT_REVERSAL_ACTOR_REQUIRED',
    ],
  }],
  ['P0002', { httpStatus: 500, messages: ['ADMIN_ACTOR_NOT_FOUND', 'PAYMENT_NOT_FOUND'] }],
  ['P0001', { httpStatus: 400, messages: ['PAYMENT_REVERSAL_CONFLICT', 'PAYMENT_NOT_CONFIRMED'] }],
]);

const permissionSettingsDomainErrors = new Map<string, {
  httpStatus: number;
  messages: readonly string[];
}>([
  ['PT409', { httpStatus: 409, messages: ['SETTINGS_CONFLICT'] }],
  ['42501', { httpStatus: 403, messages: ['FORBIDDEN', 'ADMIN_BACKEND_REQUIRED'] }],
  ['22023', { httpStatus: 400, messages: ['INVALID_REQUEST'] }],
]);

async function readSupabaseDomainError(path: string, response: Response) {
  const normalizedPath = path.replace(/^\/+/, '').split('?')[0];
  if (normalizedPath !== 'rest/v1/rpc/admin_record_payment_reversal'
    && normalizedPath !== 'rest/v1/rpc/admin_matrix_permission_settings_update') return null;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object') return null;
  const { code, message } = body as { code?: unknown; message?: unknown };
  if (typeof code !== 'string' || typeof message !== 'string') return null;
  if (normalizedPath === 'rest/v1/rpc/admin_record_payment_reversal') {
    const domain = paymentReversalDomainErrors.get(code);
    return domain?.httpStatus === response.status && domain.messages.includes(message)
      ? new SupabaseDomainError(message)
      : null;
  }
  const domain = permissionSettingsDomainErrors.get(code);
  return domain?.httpStatus === response.status && domain.messages.includes(message)
    ? new SupabaseDomainError(message, domain.httpStatus)
    : null;
}

export async function getSupabaseConfig(secretReader: SecretReader): Promise<SupabaseConfig> {
  const names = await secretReader.listSecretNames();
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  if (!required.every((name) => names.includes(name))) {
    throw new BackendIntegrationError('CONFIG_MISSING', 'Supabase backend configuration is incomplete');
  }

  const [url, serviceRoleKey] = await Promise.all([
    secretReader.readSecret('SUPABASE_URL'),
    secretReader.readSecret('SUPABASE_SERVICE_ROLE_KEY'),
  ]);
  if (!url?.trim() || !serviceRoleKey?.trim()) {
    throw new BackendIntegrationError('CONFIG_MISSING', 'Supabase backend configuration is incomplete');
  }

  return {
    url: url.trim().replace(/\/+$/, ''),
    serviceRoleKey: serviceRoleKey.trim(),
  };
}

export function createSupabaseTransport(
  configOrLoader: SupabaseConfig | (() => Promise<SupabaseConfig>),
  fetcher: typeof fetch = fetch,
) {
  const loadConfig = typeof configOrLoader === 'function'
    ? configOrLoader
    : async () => configOrLoader;
  return {
    async request<T = unknown>(path: string, init: RequestInit = {}, withCount = false): Promise<T> {
      const controller = new AbortController();
      const unavailable = () => new BackendIntegrationError('UNAVAILABLE', 'Supabase is temporarily unavailable');
      let rejectDeadline!: (reason: unknown) => void;
      const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
      const cancel = () => {
        const reason = init.signal?.reason ?? new DOMException('Request aborted', 'AbortError');
        rejectDeadline(reason);
        controller.abort(reason);
      };
      const timer = setTimeout(() => {
        const reason = unavailable();
        rejectDeadline(reason);
        controller.abort(reason);
      }, 15_000);
      init.signal?.addEventListener('abort', cancel, { once: true });
      try {
        if (init.signal?.aborted) cancel();
        return await Promise.race([deadline, (async () => {
          controller.signal.throwIfAborted();
          let config: SupabaseConfig;
          try {
            config = await loadConfig();
          } catch (error) {
            if (error instanceof BackendIntegrationError) throw error;
            throw new BackendIntegrationError('CONFIG_MISSING', 'Supabase backend configuration is incomplete');
          }
          controller.signal.throwIfAborted();
          const baseUrl = config.url.replace(/\/+$/, '');
          const headers = {
            apikey: config.serviceRoleKey,
            Authorization: `Bearer ${config.serviceRoleKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
            ...(init.headers as Record<string, string> | undefined),
          };

          let response: Response;
          try {
            response = await fetcher(`${baseUrl}/${path.replace(/^\/+/, '')}`, {
              ...init,
              headers,
              signal: controller.signal,
            });
          } catch {
            throw new BackendIntegrationError('UNAVAILABLE', 'Supabase is temporarily unavailable');
          }

          if (withCount) {
            const count = response.headers.get('Content-Range')?.match(/\/(\d+)$/)?.[1];
            const total = count === undefined ? NaN : Number(count);
            if (Number.isSafeInteger(total) && total >= 0) {
              if (response.status === 416) {
                const error = await response.json().catch(() => null);
                if (error?.code === 'PGRST103') return { items: [], total } as T;
              } else if (response.ok) {
                const items = await response.json();
                if (Array.isArray(items)) return { items, total } as T;
              }
            }
            throw new BackendIntegrationError('UNAVAILABLE', 'Supabase pagination is temporarily unavailable');
          }
          if (!response.ok) {
            const domainError = await readSupabaseDomainError(path, response);
            if (domainError) throw domainError;
            throw new BackendIntegrationError('UNAVAILABLE', 'Supabase is temporarily unavailable');
          }
          // PostgREST minimal writes can return 201 with an empty body, not only 204.
          const minimal = headers.Prefer.split(',').some((value) => value.trim() === 'return=minimal');
          if (response.status === 204 || minimal) return undefined as T;
          return await response.json() as T;
        })()]);
      } catch (error) {
        if (init.signal?.aborted) throw init.signal.reason ?? new DOMException('Request aborted', 'AbortError');
        if (error instanceof BackendIntegrationError || error instanceof SupabaseDomainError) throw error;
        throw unavailable();
      } finally {
        clearTimeout(timer);
        init.signal?.removeEventListener('abort', cancel);
      }
    },
    async requestPage<T = unknown>(path: string): Promise<{ items: T[]; total: number }> {
      return this.request(path, { headers: { Prefer: 'count=exact' } }, true);
    },
    async supabaseRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
      return this.request<T>(`/rest/v1/${path.replace(/^\/+/, '')}`, init);
    },
    async selectRows<T = unknown>(table: string, query: string): Promise<T[]> {
      return this.supabaseRequest<T[]>(`${table}?${query}`);
    },
    async insertRows<T = unknown>(table: string, rows: unknown[]): Promise<T[]> {
      return this.supabaseRequest<T[]>(table, { method: 'POST', body: JSON.stringify(rows) });
    },
    async updateRows<T = unknown>(table: string, query: string, record: unknown): Promise<T[]> {
      return this.supabaseRequest<T[]>(`${table}?${query}`, { method: 'PATCH', body: JSON.stringify(record) });
    },
    async deleteRows<T = unknown>(table: string, query: string): Promise<T[]> {
      return this.supabaseRequest<T[]>(`${table}?${query}`, { method: 'DELETE' });
    },
  };
}
