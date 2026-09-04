export type NotificationEventSecretReader = {
  listSecretNames(): Promise<string[]>;
  readSecret(name: string): Promise<unknown>;
};

export type NotificationEventConfig = {
  supabaseUrl: string;
  ingestToken: string;
};

export type SystemNotice = {
  noticeId: string;
  eventKey: string;
  category: '維護' | '更新';
  title: string;
  body: string;
  occurredAt: string;
};

type SystemNoticeInput = {
  category?: unknown;
  title?: unknown;
  body?: unknown;
};

type IngestEnvelope = {
  eventKey?: unknown;
  created?: unknown;
};

export class NotificationEventsError extends Error {
  statusCode: number;

  constructor(code: string, statusCode = 400) {
    super(code);
    this.name = 'NotificationEventsError';
    this.statusCode = statusCode;
  }
}

export async function getNotificationEventConfig(
  reader: NotificationEventSecretReader,
): Promise<NotificationEventConfig> {
  try {
    const names = await reader.listSecretNames();
    if (
      !names.includes('SUPABASE_URL')
      || !names.includes('MATRIX_NOTIFICATION_INGEST_TOKEN')
    ) {
      throw new NotificationEventsError('NOTIFICATION_INGEST_CONFIG_MISSING', 503);
    }
    const [urlValue, tokenValue] = await Promise.all([
      reader.readSecret('SUPABASE_URL'),
      reader.readSecret('MATRIX_NOTIFICATION_INGEST_TOKEN'),
    ]);
    const supabaseUrl = String(urlValue ?? '').trim().replace(/\/+$/, '');
    const ingestToken = String(tokenValue ?? '').trim();
    if (!supabaseUrl || !ingestToken) {
      throw new NotificationEventsError('NOTIFICATION_INGEST_CONFIG_MISSING', 503);
    }
    return { supabaseUrl, ingestToken };
  } catch (cause) {
    if (cause instanceof NotificationEventsError) throw cause;
    throw new NotificationEventsError('NOTIFICATION_INGEST_CONFIG_MISSING', 503);
  }
}

function normalizeInput(input: SystemNoticeInput) {
  const category = typeof input.category === 'string' ? input.category.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (
    (category !== '維護' && category !== '更新')
    || !title
    || !body
    || Array.from(title).length > 80
    || Array.from(body).length > 240
  ) {
    throw new NotificationEventsError('INVALID_SYSTEM_NOTICE', 400);
  }
  return { category, title, body } as const;
}

export function createNotificationEvents(
  loadConfig: () => Promise<NotificationEventConfig>,
  fetcher: typeof fetch = fetch,
  randomUuid: () => string = () => globalThis.crypto.randomUUID(),
  clock: () => Date = () => new Date(),
) {
  return {
    async sendSystemNotice(input: SystemNoticeInput): Promise<SystemNotice> {
      const { category, title, body } = normalizeInput(input);
      const noticeId = randomUuid();
      const eventKey = `system_notice:${noticeId}`;
      const occurredAt = clock().toISOString();
      const config = await loadConfig();
      let response: Response;
      try {
        response = await fetcher(`${config.supabaseUrl}/functions/v1/notification-ingest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-matrix-notification-token': config.ingestToken,
          },
          body: JSON.stringify({
            eventKey,
            eventType: 'system_notice',
            source: 'admin',
            occurredAt,
            payload: { noticeId, category, title, body },
          }),
        });
      } catch {
        throw new NotificationEventsError('NOTIFICATION_INGEST_FAILED', 503);
      }
      if (!response.ok) {
        throw new NotificationEventsError(
          'NOTIFICATION_INGEST_FAILED',
          response.status >= 500 ? 503 : 502,
        );
      }
      let envelope: IngestEnvelope;
      try {
        envelope = await response.json() as IngestEnvelope;
      } catch {
        throw new NotificationEventsError('NOTIFICATION_INGEST_RESPONSE_INVALID', 502);
      }
      if (
        envelope.eventKey !== eventKey
        || typeof envelope.created !== 'boolean'
      ) {
        throw new NotificationEventsError('NOTIFICATION_INGEST_RESPONSE_INVALID', 502);
      }
      return { noticeId, eventKey, category, title, body, occurredAt };
    },
  };
}
