import { describe, expect, it, vi } from 'vitest';
import {
  NotificationEventsError,
  createNotificationEvents,
  getNotificationEventConfig,
} from './notification-events';

const CONFIG = {
  supabaseUrl: 'https://project.supabase.co',
  ingestToken: 'server-only-ingest-token',
};
const NOTICE_ID = '11111111-1111-4111-8111-111111111111';
const OCCURRED_AT = '2026-09-04T04:20:00.000Z';

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createApi(fetcher: typeof fetch = vi.fn(async () => response({
  id: 'event-id',
  eventKey: `system_notice:${NOTICE_ID}`,
  created: true,
  fanoutStatus: 'pending',
}))) {
  return createNotificationEvents(
    async () => CONFIG,
    fetcher,
    () => NOTICE_ID,
    () => new Date(OCCURRED_AT),
  );
}

describe('getNotificationEventConfig', () => {
  it('reads only the server-side Supabase URL and notification ingest token', async () => {
    const reader = {
      listSecretNames: vi.fn(async () => ['SUPABASE_URL', 'MATRIX_NOTIFICATION_INGEST_TOKEN', 'OTHER_SECRET']),
      readSecret: vi.fn(async (name: string) => ({
        SUPABASE_URL: ' https://project.supabase.co/ ',
        MATRIX_NOTIFICATION_INGEST_TOKEN: ' server-only-ingest-token ',
        OTHER_SECRET: 'must-not-be-read',
      })[name]),
    };

    await expect(getNotificationEventConfig(reader)).resolves.toEqual(CONFIG);
    expect(reader.readSecret.mock.calls.map(([name]) => name).sort()).toEqual([
      'MATRIX_NOTIFICATION_INGEST_TOKEN',
      'SUPABASE_URL',
    ]);
  });

  it('fails closed when either server secret is missing or blank', async () => {
    for (const values of [
      { SUPABASE_URL: 'https://project.supabase.co', MATRIX_NOTIFICATION_INGEST_TOKEN: '' },
      { SUPABASE_URL: '', MATRIX_NOTIFICATION_INGEST_TOKEN: 'token' },
    ]) {
      const reader = {
        listSecretNames: vi.fn(async () => Object.keys(values)),
        readSecret: vi.fn(async (name: string) => values[name as keyof typeof values]),
      };
      await expect(getNotificationEventConfig(reader)).rejects.toMatchObject({
        message: 'NOTIFICATION_INGEST_CONFIG_MISSING',
        statusCode: 503,
      });
    }
  });
});

describe('createNotificationEvents', () => {
  it.each(['其他', '', '維修'])('rejects unsupported system notice category %s', async (category) => {
    const fetcher = vi.fn<typeof fetch>();
    const api = createApi(fetcher);

    await expect(api.sendSystemNotice({ category, title: '標題', body: '內容' }))
      .rejects.toMatchObject({ message: 'INVALID_SYSTEM_NOTICE', statusCode: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [{ category: '維護', title: '   ', body: '內容' }, 'blank title'],
    [{ category: '更新', title: '標題', body: '\n\t ' }, 'blank body'],
  ] as const)('rejects %s', async (input) => {
    const fetcher = vi.fn<typeof fetch>();
    const api = createApi(fetcher);

    await expect(api.sendSystemNotice(input)).rejects.toMatchObject({
      message: 'INVALID_SYSTEM_NOTICE',
      statusCode: 400,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('enforces 80/240 Unicode code-point limits rather than UTF-16 code units', async () => {
    const api = createApi();

    await expect(api.sendSystemNotice({
      category: '維護',
      title: '😀'.repeat(80),
      body: '𠮷'.repeat(240),
    })).resolves.toMatchObject({
      eventKey: `system_notice:${NOTICE_ID}`,
      title: '😀'.repeat(80),
      body: '𠮷'.repeat(240),
    });

    await expect(api.sendSystemNotice({
      category: '維護',
      title: '😀'.repeat(81),
      body: '內容',
    })).rejects.toMatchObject({ message: 'INVALID_SYSTEM_NOTICE', statusCode: 400 });

    await expect(api.sendSystemNotice({
      category: '更新',
      title: '標題',
      body: '𠮷'.repeat(241),
    })).rejects.toMatchObject({ message: 'INVALID_SYSTEM_NOTICE', statusCode: 400 });
  });

  it('builds a stable admin system_notice and sends it only to notification-ingest', async () => {
    const fetcher = vi.fn(async () => response({
      id: 'event-id',
      eventKey: `system_notice:${NOTICE_ID}`,
      created: true,
      fanoutStatus: 'pending',
    }));
    const api = createApi(fetcher);

    const notice = await api.sendSystemNotice({
      category: ' 更新 ',
      title: '  系統更新  ',
      body: '  新功能已上線。  ',
    });

    expect(notice).toEqual({
      noticeId: NOTICE_ID,
      eventKey: `system_notice:${NOTICE_ID}`,
      category: '更新',
      title: '系統更新',
      body: '新功能已上線。',
      occurredAt: OCCURRED_AT,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe('https://project.supabase.co/functions/v1/notification-ingest');
    expect(init).toMatchObject({ method: 'POST' });
    const headers = new Headers(init?.headers);
    expect(headers.get('x-matrix-notification-token')).toBe('server-only-ingest-token');
    expect(headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual({
      eventKey: `system_notice:${NOTICE_ID}`,
      eventType: 'system_notice',
      source: 'admin',
      occurredAt: OCCURRED_AT,
      payload: {
        noticeId: NOTICE_ID,
        category: '更新',
        title: '系統更新',
        body: '新功能已上線。',
      },
    });
  });

  it.each([400, 403, 500, 503])('turns notification-ingest HTTP %i into a backend error', async (status) => {
    const fetcher = vi.fn(async () => response({ error: { code: 'UPSTREAM_ERROR' } }, status));
    const api = createApi(fetcher);

    await expect(api.sendSystemNotice({ category: '維護', title: '標題', body: '內容' }))
      .rejects.toMatchObject({
        message: 'NOTIFICATION_INGEST_FAILED',
        statusCode: status >= 500 ? 503 : 502,
      });
  });

  it('rejects a malformed success envelope instead of reporting success', async () => {
    const api = createApi(vi.fn(async () => response({ created: true })));

    await expect(api.sendSystemNotice({ category: '維護', title: '標題', body: '內容' }))
      .rejects.toBeInstanceOf(NotificationEventsError);
  });
});
