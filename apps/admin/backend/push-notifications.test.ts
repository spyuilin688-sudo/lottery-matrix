import { describe, expect, it, vi } from 'vitest';
import { createPushNotifications } from './push-notifications';

const config = {
  url: 'https://example.supabase.co',
  serviceRoleKey: 'service-role-secret',
};

const USER_ONE = '11111111-1111-4111-8111-111111111111';
const USER_TWO = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_ID = '44444444-4444-4444-8444-444444444444';

function response(body: unknown, status = 200, total?: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(Array.isArray(body) ? { 'Content-Range': `${body.length ? `0-${body.length - 1}` : '*'}/${total ?? body.length}` } : {}),
    },
  });
}

describe('createPushNotifications', () => {
  it('does not call the sender when no member is selected', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const api = createPushNotifications(config, fetcher);

    await expect(api.sendMemberTestPush('   ', 'admin@test', REQUEST_ID, ADMIN_ID)).rejects.toThrow('MEMBER_REQUIRED');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a malformed member UUID before calling the Edge Function', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const api = createPushNotifications(config, fetcher);

    await expect(api.sendMemberTestPush('member-1', 'admin@test', REQUEST_ID, ADMIN_ID)).rejects.toMatchObject({
      message: 'INVALID_MEMBER_ID',
      statusCode: 400,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sends only the selected user and verified administrator to the fixed Edge Function', async () => {
    const fetcher = vi.fn(async () => response({ sent: 1, failed: 0 }));
    const api = createPushNotifications(config, fetcher);

    await expect(api.sendMemberTestPush(USER_ONE, 'admin@test', REQUEST_ID, ADMIN_ID)).resolves.toEqual({
      sent: 1,
      failed: 0,
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/send-test-push',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ userId: USER_ONE, adminAccount: 'admin@test', requestId: REQUEST_ID, adminId: ADMIN_ID }),
      }),
    );
  });

  it('loads only one bounded member page and enriches those recipients', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/rest/v1/members') return response([
        { auth_user_id: USER_ONE, line_user_id: 'line-one', line_display_name: '持久化會員一' },
        { auth_user_id: USER_TWO, line_display_name: ' ' },
      ], 200, 2);
      if (url.pathname === '/rest/v1/rpc/admin_push_member_details') {
        expect(JSON.parse(String(init?.body))).toEqual({ p_auth_user_ids: [USER_ONE, USER_TWO] });
        return response([
          { id: USER_ONE, user_metadata: { picture: 'https://example.com/avatar.png' }, push_enabled: true },
          { id: USER_TWO, user_metadata: { full_name: 'Google 會員二' }, identities: [{ provider: 'google', provider_id: 'google-two' }], push_enabled: false },
        ]);
      }
      throw new Error(`Unexpected unbounded request: ${url}`);
    });
    const result = await createPushNotifications(config, fetcher).listMemberPushStatus();
    expect(result).toEqual({
      items: [
        { userId: USER_ONE, identityLabel: 'LINE ID', identityValue: 'line-one', identityDisplay: 'LINE ID：line-one', displayName: '持久化會員一', pictureUrl: 'https://example.com/avatar.png', pushEnabled: true },
        { userId: USER_TWO, identityLabel: 'Google ID', identityValue: 'google-two', identityDisplay: 'Google ID：google-two', displayName: 'Google 會員二', pictureUrl: null, pushEnabled: false },
      ], total: 2, currentPage: 1, totalPages: 1,
    });
    const urls = fetcher.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.find(url => url.pathname === '/rest/v1/members')?.searchParams.get('limit')).toBe('30');
    expect(urls.map(url => url.pathname)).toEqual(['/rest/v1/members', '/rest/v1/rpc/admin_push_member_details']);
  });

  it('keeps late pages discoverable while filling only 30 rows under a server cap', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/rest/v1/members') {
        const offset = Number(url.searchParams.get('offset'));
        const count = Math.min(7, Number(url.searchParams.get('limit')), 1105 - offset);
        return response(Array.from({ length: count }, (_, index) => ({ auth_user_id: `0000${String(offset + index).padStart(4, '0')}-1111-4111-8111-111111111111` })), 200, 1105);
      }
      if (url.pathname === '/rest/v1/rpc/admin_push_member_details') {
        return response(JSON.parse(String(init?.body)).p_auth_user_ids.map((id: string) => ({ id, push_enabled: false })));
      }
      throw new Error('unbounded request');
    });
    const api = createPushNotifications(config, fetcher);
    const result = await api.listMemberPushStatus({ page: 35 });
    expect(result).toMatchObject({ total: 1105, currentPage: 35, totalPages: 37 });
    expect(result.items).toHaveLength(30);
    expect(result.items[0].userId).toBe('00001020-1111-4111-8111-111111111111');
    expect(fetcher.mock.calls.filter(([input]) => new URL(String(input)).pathname === '/rest/v1/members').map(([input]) => new URL(String(input)).searchParams.get('offset'))).toEqual(['1020', '1027', '1034', '1041', '1048']);
  });

  it('uses the server paged search for names and identities and enriches only its result', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/rest/v1/rpc/admin_push_member_page') {
        expect(JSON.parse(String(init?.body))).toEqual({ p_keyword: 'Google 會員', p_page: 4 });
        return response({ items: [{ auth_user_id: USER_TWO }], total: 91, currentPage: 4, totalPages: 4 });
      }
      if (url.pathname === '/rest/v1/rpc/admin_push_member_details') {
        expect(JSON.parse(String(init?.body))).toEqual({ p_auth_user_ids: [USER_TWO] });
        return response([{ id: USER_TWO, user_metadata: { name: 'Google 會員' }, push_enabled: false }]);
      }
      throw new Error('Unexpected full scan');
    });
    const result = await createPushNotifications(config, fetcher).listMemberPushStatus({ keyword: ' Google 會員 ', page: 4 });
    expect(result).toMatchObject({ total: 91, currentPage: 4, totalPages: 4, items: [{ userId: USER_TWO, displayName: 'Google 會員' }] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('restricts post-send revalidation to the selected member', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/rest/v1/members');
      expect(url.searchParams.get('auth_user_id')).toBe(`eq.${USER_TWO}`);
      return response([], 200, 0);
    });
    await expect(createPushNotifications(config, fetcher).listMemberPushStatus({ userId: USER_TWO })).resolves.toMatchObject({ items: [], total: 0 });
  });

  it('does not fetch identities or devices for an empty page', async () => {
    const fetcher = vi.fn(async () => response([], 200, 0));
    await expect(createPushNotifications(config, fetcher).listMemberPushStatus()).resolves.toEqual({ items: [], total: 0, currentPage: 1, totalPages: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('fails closed if a batch omits the selected recipient or push status', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === '/rest/v1/members') return response([{ auth_user_id: USER_ONE }], 200, 1);
      if (url.pathname === '/rest/v1/rpc/admin_push_member_details') return response([]);
      throw new Error('unexpected request');
    });
    await expect(createPushNotifications(config, fetcher).listMemberPushStatus())
      .rejects.toMatchObject({ statusCode: 503 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([0, -1, 1.5, 'oops', Number.MAX_SAFE_INTEGER])('rejects invalid page %s without reading data', async page => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(createPushNotifications(config, fetcher).listMemberPushStatus({ page })).rejects.toMatchObject({ statusCode: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('resolves only the bounded log recipients including names outside the current member page', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/rest/v1/push_delivery_logs') return response([{ id: 'log', user_id: USER_TWO }]);
      if (url.pathname === '/rest/v1/rpc/admin_push_log_member_names') {
        expect(JSON.parse(String(init?.body))).toEqual({ p_auth_user_ids: [USER_TWO] });
        return response([{ user_id: USER_TWO, display_name: 'Google 紀錄會員' }]);
      }
      throw new Error('unexpected identity scan');
    });
    expect(await createPushNotifications(config, fetcher).listPushDeliveryLogs()).toMatchObject([{ userId: USER_TWO, displayName: 'Google 紀錄會員' }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('maps delivery log columns and requests newest records first', async () => {
    const fetcher = vi.fn(async () => response([{
      id: 'log-1',
      user_id: 'user-1',
      subscription_id: 'subscription-1',
      title: '樂彩 Matrix 測試通知',
      body: '手機推播已成功啟用',
      status: 'failed',
      failure_reason: 'endpoint expired',
      admin_account: 'admin@test',
      sent_at: '2026-08-30T10:00:00.000Z',
    }]));
    const api = createPushNotifications(config, fetcher);

    await expect(api.listPushDeliveryLogs()).resolves.toEqual([{
      displayName: null,
      id: 'log-1',
      userId: 'user-1',
      subscriptionId: 'subscription-1',
      title: '樂彩 Matrix 測試通知',
      body: '手機推播已成功啟用',
      status: 'failed',
      failureReason: 'endpoint expired',
      adminAccount: 'admin@test',
      sentAt: '2026-08-30T10:00:00.000Z',
    }]);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/rest/v1/push_delivery_logs?select=id%2Cuser_id%2Csubscription_id%2Ctitle%2Cbody%2Cstatus%2Cfailure_reason%2Cadmin_account%2Csent_at&order=sent_at.desc'),
      expect.any(Object),
    );
  });

  it('surfaces a stable Supabase failure while listing member status', async () => {
    const fetcher = vi.fn(async () => response({ message: 'database details' }, 500));
    const api = createPushNotifications(config, fetcher);

    await expect(api.listMemberPushStatus()).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      statusCode: 503,
    });
  });

  it.each([
    [400, 'INVALID_REQUEST'],
    [409, 'NO_ACTIVE_SUBSCRIPTIONS'],
    [409, 'TEST_PUSH_IN_PROGRESS'],
    [500, 'SUBSCRIPTION_LOOKUP_FAILED'],
    [503, 'TEST_PUSH_STATUS_UNKNOWN'],
  ])('preserves the safe Edge business failure for HTTP %i', async (status, code) => {
    const fetcher = vi.fn(async () => response({ error: { code } }, status));
    const api = createPushNotifications(config, fetcher);

    await expect(api.sendMemberTestPush(USER_ONE, 'admin@test', REQUEST_ID, ADMIN_ID)).rejects.toMatchObject({
      code,
      message: code,
      statusCode: status,
    });
  });

  it.each([
    ['an unexpected Edge 5xx', vi.fn(async () => response({ error: 'private detail' }, 500))],
    ['an Edge network failure', vi.fn(async () => { throw new Error('private network detail'); })],
  ])('keeps %s as a stable upstream failure', async (_label, fetcher) => {
    const api = createPushNotifications(config, fetcher);

    await expect(api.sendMemberTestPush(USER_ONE, 'admin@test', REQUEST_ID, ADMIN_ID)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      message: 'Supabase is temporarily unavailable',
      statusCode: 503,
    });
  });

  it('does not expose a non-allow-listed Edge error body', async () => {
    const fetcher = vi.fn(async () => response({
      error: { code: 'PRIVATE_DATABASE_DETAIL', message: 'service-role-secret' },
    }, 409));
    const api = createPushNotifications(config, fetcher);

    const failure = await api.sendMemberTestPush(USER_ONE, 'admin@test', REQUEST_ID, ADMIN_ID).catch((error) => error);
    expect(failure).toMatchObject({
      code: 'UNAVAILABLE',
      message: 'Supabase is temporarily unavailable',
      statusCode: 503,
    });
    expect(String(failure)).not.toContain('PRIVATE_DATABASE_DETAIL');
    expect(String(failure)).not.toContain('service-role-secret');
  });
});

it('surfaces a later capped-page failure rather than presenting partial recipients', async () => {
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname !== '/rest/v1/members') return response({});
    return Number(url.searchParams.get('offset')) === 0
      ? response([{ auth_user_id: USER_ONE }], 200, 2)
      : response({ message: 'later page unavailable' }, 500);
  });
  await expect(createPushNotifications(config, fetcher).listMemberPushStatus()).rejects.toMatchObject({ code: 'UNAVAILABLE', statusCode: 503 });
});
