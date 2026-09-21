import { expect, it, vi } from 'vitest';
import { formatAdminRowForDisplay } from '../src/admin-display';
import { createPushNotifications } from './push-notifications';

const USER_ID = '22222222-2222-4222-8222-222222222222';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...(Array.isArray(body) ? { 'Content-Range': `0-${body.length - 1}/${body.length}` } : {}) },
  });
}

it('includes LINE and Google nicknames in activation-code display rows', () => {
  const line = formatAdminRowForDisplay('activationCodes', {
    id: 'code-line',
    memberDisplayName: null,
    redeemedByLineDisplayName: 'LINE 兌換者',
    identityDisplay: 'LINE ID：line-code',
  });
  const google = formatAdminRowForDisplay('activationCodes', {
    id: 'code-google',
    memberDisplayName: 'Google 會員',
    redeemedByLineDisplayName: null,
    identityDisplay: 'Google ID：google-user',
  });

  expect(line.identityDisplay).toBe('LINE 兌換者 · LINE ID：line-code');
  expect(google.identityDisplay).toBe('Google 會員 · Google ID：google-user');
});

it('uses the canonical Google full_name fallback in push-member status', async () => {
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/rest/v1/members?')) {
      return jsonResponse([{ auth_user_id: USER_ID, line_user_id: null, line_display_name: null }]);
    }
    if (url.includes('/auth/v1/admin/users/')) {
      return jsonResponse({
        id: USER_ID,
        user_metadata: { full_name: 'Google 會員' },
        identities: [{
          provider: 'google',
          provider_id: 'google-user',
          identity_data: { full_name: 'Google 會員' },
        }],
      });
    }
    if (url.includes('/rest/v1/member_push_subscriptions?')) return jsonResponse([]);
    return jsonResponse({}, 404);
  });

  const members = await createPushNotifications({
    url: 'https://example.supabase.co',
    serviceRoleKey: 'service-role-secret',
  }, fetcher).listMemberPushStatus();

  expect(members.items[0]).toMatchObject({
    identityDisplay: 'Google ID：google-user',
    displayName: 'Google 會員',
  });
});
