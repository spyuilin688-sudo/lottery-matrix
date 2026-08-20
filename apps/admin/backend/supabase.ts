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
    async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
      let config: SupabaseConfig;
      try {
        config = await loadConfig();
      } catch (error) {
        if (error instanceof BackendIntegrationError) throw error;
        throw new BackendIntegrationError('CONFIG_MISSING', 'Supabase backend configuration is incomplete');
      }
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
        });
      } catch {
        throw new BackendIntegrationError('UNAVAILABLE', 'Supabase is temporarily unavailable');
      }

      if (!response.ok) {
        throw new BackendIntegrationError('UNAVAILABLE', 'Supabase is temporarily unavailable');
      }
      if (response.status === 204) return undefined as T;
      return await response.json() as T;
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
