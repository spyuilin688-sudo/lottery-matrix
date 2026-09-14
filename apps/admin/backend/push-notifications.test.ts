import { describe, expect, it, vi } from 'vitest';
import { createPushNotifications } from './push-notifications';

const config = {
  url: 'https://example.supabase.co',
  serviceRoleKey: 'service-role-secret',
};

const USER_ONE = '11111111-1111-4111-8111-111111111111';
const USER_TWO = '22222222-2222-4222-8222-222222222222';

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

    await expect(api.sendMemberTestPush('   ', 'admin@test')).rejects.toThrow('MEMBER_REQUIRED');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a malformed member UUID before calling the Edge Function', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const api = createPushNotifications(config, fetcher);

    await expect(api.sendMemberTestPush('member-1', 'admin@test')).rejects.toMatchObject({
      message: 'INVALID_MEMBER_ID',
      statusCode: 400,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sends only the selected user and verified administrator to the fixed Edge Function', async () => {
    const fetcher = vi.fn(async () => response({ sent: 1, failed: 0 }));
    const api = createPushNotifications(config, fetcher);

    await expect(api.sendMemberTestPush(USER_ONE, 'admin@test')).resolves.toEqual({
      sent: 1,
      failed: 0,
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/send-test-push',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ userId: USER_ONE, adminAccount: 'admin@test' }),
      }),
    );
  });

  it('maps member identity, LINE profile, and enabled subscriptions by auth user id', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/rest/v1/members?')) {
        return response([
          { auth_user_id: USER_ONE, line_display_name: '持久化會員一' },
          { auth_user_id: USER_TWO, line_display_name: '持久化會員二' },
        ]);
      }
      if (url.includes('/auth/v1/admin/users?')) {
        return response({ users: [
          {
            id: USER_ONE,
            user_metadata: {
              name: '目前會員一',
              picture: 'https://metadata.example/one.png',
            },
            identities: [{
              provider: 'custom:line',
              identity_data: { name: 'LINE 會員一', picture: 'https://line.example/one.png' },
            }],
          },
          {
            id: USER_TWO,
            user_metadata: {},
            identities: [{
              provider: 'custom:line',
              identity_data: { name: 'LINE 會員二', picture: 'https://line.example/two.png' },
            }],
          },
        ] });
      }
      if (url.includes('/rest/v1/member_push_subscriptions?')) {
        return response([{ id: 'subscription-1', user_id: USER_ONE }]);
      }
      return response({}, 404);
    });
    const api = createPushNotifications(config, fetcher);

    await expect(api.listMemberPushStatus()).resolves.toEqual([
      {
        userId: USER_ONE,
        displayName: '目前會員一',
        pictureUrl: 'https://metadata.example/one.png',
        pushEnabled: true,
      },
      {
        userId: USER_TWO,
        displayName: 'LINE 會員二',
        pictureUrl: 'https://line.example/two.png',
        pushEnabled: false,
      },
    ]);

    const urls = fetcher.mock.calls.map(([input]) => String(input));
    expect(urls).toEqual(expect.arrayContaining([
      expect.stringContaining('/rest/v1/members?select=auth_user_id%2Cline_display_name'),
      expect.stringContaining('/auth/v1/admin/users?page=1&per_page=1000'),
      expect.stringContaining('/rest/v1/member_push_subscriptions?select=id%2Cuser_id&enabled=eq.true'),
    ]));
  });

  it('reads every member, Auth profile, and enabled subscription page beyond 1000 rows', async () => {
    const memberPageOne = Array.from({ length: 1000 }, (_, index) => ({
      auth_user_id: `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`,
      line_display_name: `member-${index}`,
    }));
    const targetUserId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const authPageOne = memberPageOne.map((member) => ({
      id: member.auth_user_id,
      user_metadata: { name: member.line_display_name },
      identities: [],
    }));
    const subscriptionPageOne = Array.from({ length: 1000 }, (_, index) => ({
      id: `subscription-${index}`,
      user_id: memberPageOne[0].auth_user_id,
    }));
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const range = new Headers(init?.headers).get('Range');
      if (url.includes('/rest/v1/members?')) {
        return range === '0-999'
          ? response(memberPageOne, 200, 1001)
          : response([{ auth_user_id: targetUserId, line_display_name: 'stale target' }], 200, 1001);
      }
      if (url.includes('/auth/v1/admin/users?')) {
        return url.includes('?page=1&')
          ? response({ users: authPageOne })
          : response({ users: [{
            id: targetUserId,
            user_metadata: { name: 'target metadata', picture: 'https://metadata.example/target.png' },
            identities: [],
          }] });
      }
      if (url.includes('/rest/v1/member_push_subscriptions?')) {
        return range === '0-999'
          ? response(subscriptionPageOne, 200, 1001)
          : response([{ id: 'target-subscription', user_id: targetUserId }], 200, 1001);
      }
      return response({}, 404);
    });
    const api = createPushNotifications(config, fetcher);

    const members = await api.listMemberPushStatus();

    expect(members).toHaveLength(1001);
    expect(members.at(-1)).toEqual({
      userId: targetUserId,
      displayName: 'target metadata',
      pictureUrl: 'https://metadata.example/target.png',
      pushEnabled: true,
    });
    const calls = fetcher.mock.calls.map(([input, init]) => ({
      url: String(input),
      range: new Headers(init?.headers).get('Range'),
    }));
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: expect.stringContaining('/rest/v1/members?'), range: '1000-1999' }),
      expect.objectContaining({ url: expect.stringContaining('/auth/v1/admin/users?page=2&per_page=1000') }),
      expect.objectContaining({ url: expect.stringContaining('/rest/v1/member_push_subscriptions?'), range: '1000-1999' }),
    ]));
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
  ])('preserves the safe Edge business failure for HTTP %i', async (status, code) => {
    const fetcher = vi.fn(async () => response({ error: { code } }, status));
    const api = createPushNotifications(config, fetcher);

    await expect(api.sendMemberTestPush(USER_ONE, 'admin@test')).rejects.toMatchObject({
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

    await expect(api.sendMemberTestPush(USER_ONE, 'admin@test')).rejects.toMatchObject({
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

    const failure = await api.sendMemberTestPush(USER_ONE, 'admin@test').catch((error) => error);
    expect(failure).toMatchObject({
      code: 'UNAVAILABLE',
      message: 'Supabase is temporarily unavailable',
      statusCode: 503,
    });
    expect(String(failure)).not.toContain('PRIVATE_DATABASE_DETAIL');
    expect(String(failure)).not.toContain('service-role-secret');
  });
});

it('includes every member and enabled device under a 137-row PostgREST cap', async () => {
  const members = Array.from({ length: 1105 }, (_, index) => ({ auth_user_id: `user-${index}`, line_display_name: `會員 ${index}` }));
  const subscriptions = members.map((member, index) => ({ id: `device-${index}`, user_id: member.auth_user_id }));
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/admin/users') return response({ users: [] });
    const rows = url.pathname === '/rest/v1/members' ? members : subscriptions;
    const rangeStart = new Headers(init?.headers).get('Range')?.split('-')[0];
    const start = Number(url.searchParams.get('offset') ?? rangeStart ?? 0);
    const page = rows.slice(start, start + 137);
    return new Response(JSON.stringify(page), { headers: { 'Content-Type': 'application/json', 'Content-Range': `${start}-${start + page.length - 1}/${rows.length}` } });
  });
  const result = await createPushNotifications(config, fetcher).listMemberPushStatus();
  expect(result).toHaveLength(1105);
  expect(result.every(member => member.pushEnabled)).toBe(true);
  expect(result.at(-1)).toMatchObject({ userId: 'user-1104', displayName: '會員 1104', pushEnabled: true });
  for (const table of ['members', 'member_push_subscriptions']) {
    const offsets = fetcher.mock.calls.filter(([input]) => new URL(String(input)).pathname === `/rest/v1/${table}`).map(([input, init]) => {
      const url = new URL(String(input));
      return Number(url.searchParams.get('offset') ?? new Headers(init?.headers).get('Range')?.split('-')[0] ?? 0);
    });
    expect(offsets).toEqual([0, 137, 274, 411, 548, 685, 822, 959, 1096]);
  }
});

it('surfaces a failure after a short capped member page instead of returning partial push status', async () => {
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/admin/users') return response({ users: [] });
    if (url.pathname === '/rest/v1/member_push_subscriptions') return new Response('[]', { headers: { 'Content-Range': '*/0' } });
    const offset = Number(url.searchParams.get('offset') ?? new Headers(init?.headers).get('Range')?.split('-')[0] ?? 0);
    return offset === 0
      ? new Response(JSON.stringify([{ auth_user_id: USER_ONE }]), { headers: { 'Content-Range': '0-0/2' } })
      : response({ message: 'later page unavailable' }, 500);
  });
  await expect(createPushNotifications(config, fetcher).listMemberPushStatus()).rejects.toMatchObject({ code: 'UNAVAILABLE', statusCode: 503 });
});
