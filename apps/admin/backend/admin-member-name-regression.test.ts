import { expect, it, vi } from 'vitest';
import { listAdminTable } from './admin-data';
import { createPushNotifications } from './push-notifications';

const USER_ID = '22222222-2222-4222-8222-222222222222';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

it('keeps the activation-code redeemer LINE nickname as memberDisplayName', async () => {
  const request = vi.fn(async (path: string) => path.includes('offset=0') ? [{
    id: 'code-1',
    batch_id: 'batch-1',
    code: 'ABCD-EFGH-IJKL-MNOP',
    duration_type: '30_days',
    created_at: '2026-09-05T00:00:00Z',
    expires_at: '2026-10-05T00:00:00Z',
    redeemed_at: '2026-09-05T01:00:00Z',
    status: 'used',
    redeemed_member: {
      id: 'member-1',
      auth_user_id: 'auth-code',
      line_user_id: 'line-code',
      line_display_name: 'LINE 兌換者',
    },
  }] : []);

  const result = await listAdminTable('activationCodes', { request });

  expect(result.items[0]).toMatchObject({
    lineDisplayName: 'LINE 兌換者',
    memberDisplayName: 'LINE 兌換者',
    identityDisplay: 'LINE ID：line-code',
  });
});

it('uses the canonical Google full_name fallback in push-member status', async () => {
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/rest/v1/members?')) {
      return jsonResponse([{ auth_user_id: USER_ID, line_user_id: null, line_display_name: null }]);
    }
    if (url.includes('/auth/v1/admin/users?')) {
      return jsonResponse({ users: [{
        id: USER_ID,
        user_metadata: { full_name: 'Google 會員' },
        identities: [{
          provider: 'google',
          provider_id: 'google-user',
          identity_data: { full_name: 'Google 會員' },
        }],
      }] });
    }
    if (url.includes('/rest/v1/member_push_subscriptions?')) return jsonResponse([]);
    return jsonResponse({}, 404);
  });

  const members = await createPushNotifications({
    url: 'https://example.supabase.co',
    serviceRoleKey: 'service-role-secret',
  }, fetcher).listMemberPushStatus();

  expect(members[0]).toMatchObject({
    identityDisplay: 'Google ID：google-user',
    displayName: 'Google 會員',
  });
});
