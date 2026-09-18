type AdminClient = { get(path: string): Promise<{ data: { admin: Record<string, unknown> } }> };
type BatchClient = { post(path: string, body: unknown): Promise<unknown> };

export async function loadAdminBootstrap(client: AdminClient) {
  try {
    const { data } = await client.get('/api/bootstrap');
    if (!data.admin?.id) throw new Error('無法載入後台');
    return { kind: 'ready', admin: data.admin } as const;
  } catch (error) {
    const failure = error as { status?: number; statusCode?: number; response?: { status?: number } } | null;
    const status = failure?.status ?? failure?.statusCode ?? failure?.response?.status;
    return {
      kind: status === 401 || status === 403 ? 'unauthorized' : 'unavailable',
      message: error instanceof Error ? error.message : '無法載入後台',
    } as const;
  }
}

type RetryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function sessionRetryStorage(): RetryStorage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; }
  catch { return null; }
}

export function createActivationBatchSubmitter(client: BatchClient, storage: RetryStorage | null = sessionRetryStorage()) {
  const pending = new Map<string, string>();
  return {
    async submit(actorId: string, durationType: string, quantity: number) {
      const key = `matrix:admin:activation-request:${JSON.stringify([actorId, durationType, quantity])}`;
      let requestId = pending.get(key);
      if (!requestId) {
        try {
          const stored = storage?.getItem(key);
          if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored)) requestId = stored;
        } catch { storage = null; /* Keep the in-memory fallback. */ }
        requestId ??= crypto.randomUUID();
        pending.set(key, requestId);
      }
      // Retain only the request identity; never persist credentials or generated codes.
      try { storage?.setItem(key, requestId); } catch { storage = null; /* Keep the in-memory fallback. */ }
      const result = await client.post('/api/activation-codes/batch', { durationType, quantity, requestId });
      if (pending.get(key) === requestId) pending.delete(key);
      try {
        if (storage?.getItem(key) === requestId) storage.removeItem(key);
      } catch { storage = null; /* Ignore stale storage after a confirmed success. */ }
      return result;
    },
  };
}
