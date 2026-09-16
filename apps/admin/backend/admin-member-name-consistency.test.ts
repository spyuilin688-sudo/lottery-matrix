import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { formatAdminRowForDisplay } from '../src/admin-display';
import { listAdminTable, listAdminTablePage } from './admin-data';

const GOOGLE_AUTH_ID = '11111111-1111-4111-8111-111111111111';
const GOOGLE_MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const migration = readFileSync(
  new URL('../../../supabase/migrations/20260916140000_admin_member_display_name_search.sql', import.meta.url),
  'utf8',
).toLowerCase();

it('normalizes the redeemed LINE nickname into activation-code memberDisplayName', async () => {
  const request = vi.fn(async (path: string) => {
    if (path.includes('/rest/v1/activation_codes?') && path.includes('offset=0')) {
      return [{
        id: 'activation-1',
        batch_id: 'batch-1',
        code: 'CODE-1',
        duration_type: '30_days',
        created_at: '2026-09-16T00:00:00.000Z',
        expires_at: null,
        redeemed_at: '2026-09-16T01:00:00.000Z',
        status: 'used',
        redeemed_member: {
          id: 'member-line',
          auth_user_id: '33333333-3333-4333-8333-333333333333',
          line_user_id: 'line-user-1',
          line_display_name: 'LINE 會員',
        },
      }];
    }
    if (path.includes('/rest/v1/activation_codes?')) return [];
    throw new Error(`unexpected request: ${path}`);
  });

  const result = await listAdminTable('activationCodes', { request });

  expect(result.items[0]).toMatchObject({
    memberDisplayName: 'LINE 會員',
    identityDisplay: 'LINE ID：line-user-1',
  });
});

it('uses memberDisplayName in transfer and payment display rows before provider ID', () => {
  const transfer = formatAdminRowForDisplay('transferRequests', {
    id: 'transfer-1',
    memberDisplayName: 'Google 會員',
    identityDisplay: 'Google ID：google-user',
  });
  const payment = formatAdminRowForDisplay('subscriptionRecords', {
    id: 'payment-1',
    memberDisplayName: 'LINE 會員',
    identityDisplay: 'LINE ID：line-user',
  });

  expect(transfer.identityDisplay).toBe('Google 會員 · Google ID：google-user');
  expect(payment.identityDisplay).toBe('LINE 會員 · LINE ID：line-user');
});

it('uses a targeted RPC to search transfer requests by Google nickname', async () => {
  const googleUser = {
    id: GOOGLE_AUTH_ID,
    user_metadata: { full_name: 'Google 搜尋會員' },
    identities: [{
      provider: 'google',
      provider_id: 'google-provider-1',
      identity_data: { full_name: 'Google 搜尋會員' },
    }],
  };
  const request = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/rest/v1/rpc/admin_member_ids_by_display_name') {
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ p_keyword: 'Google 搜尋會員' });
      return [{ member_id: GOOGLE_MEMBER_ID }];
    }
    if (path.startsWith('/auth/v1/admin/users?')) return { users: [googleUser] };
    throw new Error(`unexpected request: ${path}`);
  });
  const requestPage = vi.fn(async (path: string) => {
    if (!path.startsWith('/rest/v1/transfer_requests?')) throw new Error(`unexpected page request: ${path}`);
    expect(decodeURIComponent(path)).toContain(`member_id.in.(${GOOGLE_MEMBER_ID})`);
    return {
      total: 1,
      items: [{
        id: 'transfer-google',
        member_id: GOOGLE_MEMBER_ID,
        plan_id: 'plan-1',
        amount: 100,
        transferred_at: '2026-09-16T00:00:00.000Z',
        account_last_five: '12345',
        submitted_at: '2026-09-16T00:00:00.000Z',
        status: 'pending',
        plan: { name: 'Matrix Pro' },
        member: {
          auth_user_id: GOOGLE_AUTH_ID,
          line_user_id: null,
          line_display_name: null,
        },
      }],
    };
  });

  const result = await listAdminTablePage('transferRequests', {
    page: 1,
    keyword: 'Google 搜尋會員',
    status: 'all',
    sortBy: 'submittedAt',
    sortDirection: 'desc',
  }, { request, requestPage });

  expect(request.mock.calls.some(([path]) => String(path).startsWith('/rest/v1/members?select=id,auth_user_id'))).toBe(false);
  expect(result.items[0]).toMatchObject({
    memberDisplayName: 'Google 搜尋會員',
    identityDisplay: 'Google ID：google-provider-1',
  });
});

it('keeps the member-name search RPC private to the server-side service role', () => {
  expect(migration).toContain('create or replace function public.admin_member_ids_by_display_name');
  expect(migration).toContain('security definer');
  expect(migration).toContain("set search_path = ''");
  expect(migration).toContain('auth.users');
  expect(migration).toContain('auth.identities');
  expect(migration).toContain('revoke all on function public.admin_member_ids_by_display_name(text) from public, anon, authenticated');
  expect(migration).toContain('grant execute on function public.admin_member_ids_by_display_name(text) to service_role');
});

it('shows both member name and provider ID in the subscription action dialog', () => {
  const source = readFileSync(new URL('../src/AdminApp.tsx', import.meta.url), 'utf8');
  const dialog = source.slice(source.indexOf('className="operationDialog"'), source.indexOf('className="operationDialog"') + 1600);

  expect(dialog).toContain('editing.memberDisplayName');
  expect(dialog).toContain('editing.identityDisplay');
});
