import { expect, test, vi } from 'vitest';
import { listAdminMemberPage } from './admin-data';
import { createSupabaseTransport } from './supabase';

const member = { id: '11111111-1111-4111-8111-111111111111', auth_user_id: null, line_display_name: '找到的會員', current_plan: { name: '月費方案' } };
test('member page requests only 30 rows, preserves filtered total and scopes online summaries to returned members', async () => {
  const request = vi.fn().mockResolvedValue([]);
  const requestPage = vi.fn().mockResolvedValue({ items: [member], total: 31 });
  const result = await listAdminMemberPage('users', { page: '2', keyword: '', status: 'disabled' }, { request, requestPage });
  expect(result).toMatchObject({ total: 31, currentPage: 2, totalPages: 2, items: [{ lineDisplayName: '找到的會員' }] });
  const query = new URL(requestPage.mock.calls[0][0], 'https://test').searchParams;
  expect(query.get('limit')).toBe('30'); expect(query.get('offset')).toBe('30');
  expect(query.get('status')).toBe('in.(disabled,inactive,停用)');
  expect(request.mock.calls.filter(([p]) => p.includes('member_online_sessions')).every(([p]) => new URL(p, 'https://test').searchParams.get('member_id') === 'in.(11111111-1111-4111-8111-111111111111)')).toBe(true);
});

test('search includes plan, nickname, referral and invitation before pagination and escapes filter syntax', async () => {
  const request = vi.fn().mockResolvedValue([]);
  const requestPage = vi.fn().mockResolvedValue({ items: [], total: 0 });
  await listAdminMemberPage('users', { page: '1', keyword: '月費,(x)', status: 'all' }, { request, requestPage });
  const query = new URL(requestPage.mock.calls[0][0], 'https://test').searchParams;
  expect(query.get('or')).toContain('line_display_name.imatch."月費,\\\\(x\\\\)"');
  expect(query.get('or')).toContain('referral_code.imatch.');
  expect(query.get('or')).toContain('invitation_code.imatch.');
  expect(query.get('or')).toContain('keyword_plan.not.is.null');
  expect(query.get('select')).toContain('keyword_plan:plans!members_current_plan_id_fkey()');
  expect(query.get('keyword_plan.name')).toBe('imatch.月費,\\(x\\)');
  expect(request).not.toHaveBeenCalled();
});

test.each(['users', 'subscriptions'] as const)('%s active search includes legacy null status without weakening the status or keyword filters', async table => {
  const request = vi.fn().mockResolvedValue([]);
  const requestPage = vi.fn().mockResolvedValue({ items: [], total: 0 });

  await listAdminMemberPage(table, { page: 1, keyword: '月費,(x)', status: 'active' }, { request, requestPage });

  const query = new URL(requestPage.mock.calls[0][0], 'https://test').searchParams;
  // Separate AND/OR groups keep the status requirement in force during search.
  // An allowlist plus NULL continues to exclude disabled and unknown statuses.
  expect(query.has('status')).toBe(false);
  expect(query.get('and')).toBe('(or(status.in.(active,啟用),status.is.null))');
  expect(query.get('or')).toContain('line_display_name.imatch."月費,\\\\(x\\\\)"');
  expect(query.get('or')).toContain('keyword_plan.not.is.null');
  expect(query.get('select')).toContain('keyword_plan:plans!members_current_plan_id_fkey()');
  expect(query.get('keyword_plan.name')).toBe('imatch.月費,\\(x\\)');
  expect(request).not.toHaveBeenCalled();
});

test('deleted last page clamps to final available page without fetching the full table', async () => {
  const requestPage = vi.fn().mockResolvedValueOnce({ items: [], total: 31 }).mockResolvedValueOnce({ items: [member], total: 31 });
  const result = await listAdminMemberPage('subscriptions', { page: '9' }, { request: vi.fn().mockResolvedValue([]), requestPage });
  expect(result.currentPage).toBe(2);
  expect(requestPage.mock.calls[1][0]).toContain('offset=30');
});

test.each(['0', '-1', '1.5', 'NaN', '9007199254740991'])('invalid page %s is rejected before reading', async page => {
  const requestPage = vi.fn();
  await expect(listAdminMemberPage('users', { page }, { request: vi.fn(), requestPage })).rejects.toThrow();
  expect(requestPage).not.toHaveBeenCalled();
});

test('transport reads exact Content-Range total and handles an out of range empty page', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([member]), { status: 206, headers: { 'Content-Range': '30-30/61' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'PGRST103' }), { status: 416, headers: { 'Content-Range': '*/31' } }));
  const transport = createSupabaseTransport({ url: 'https://example.test', serviceRoleKey: 'test-key' }, fetcher);
  await expect(transport.requestPage('/rest/v1/members?limit=30&offset=30')).resolves.toEqual({ items: [member], total: 61 });
  expect(fetcher.mock.calls[0][1].headers.Prefer).toContain('count=exact');
  await expect(transport.requestPage('/rest/v1/members?limit=30&offset=240')).resolves.toEqual({ items: [], total: 31 });
});

test('an explicit disabled subscription filter overrides the default active group while retaining plan eligibility and search', async () => {
  const request = vi.fn();
  const requestPage = vi.fn().mockResolvedValue({ items: [], total: 0 });
  await listAdminMemberPage('subscriptions', { status: 'disabled', plan: 'quarterly', keyword: '季費' }, { request, requestPage }, new Date('2026-09-14T00:00:00Z'));
  const query = new URL(requestPage.mock.calls[0][0], 'https://test').searchParams;
  expect(query.get('status')).toBe('in.(disabled,inactive,停用)');
  expect(query.has('and')).toBe(false);
  expect(query.get('current_plan.duration_days')).toBe('eq.90');
  expect(query.get('plan_expires_at')).toBe('gt.2026-09-14T00:00:00.000Z');
  expect(query.get('is_lifetime')).toBe('eq.false');
  expect(query.get('select')).toContain('current_plan:plans!members_current_plan_id_fkey!inner(name,price,duration_days)');
  expect(query.get('keyword_plan.name')).toBe('imatch.季費');
  expect(query.get('or')).toContain('keyword_plan.not.is.null');
  expect(request).not.toHaveBeenCalled();
});

test.each([undefined, 'all'])('subscription status %s retains the default enabled-plan view', async status => {
  const requestPage = vi.fn().mockResolvedValue({ items: [], total: 0 });
  await listAdminMemberPage('subscriptions', { status }, { request: vi.fn(), requestPage }, new Date('2026-09-14T00:00:00Z'));
  const query = new URL(requestPage.mock.calls[0][0], 'https://test').searchParams;
  expect(query.has('status')).toBe(false);
  expect(query.get('and')).toBe('(or(status.in.(active,啟用),status.is.null))');
  expect(query.get('current_plan.duration_days')).toBe('in.(30,90,365)');
  expect(query.get('plan_expires_at')).toBe('gt.2026-09-14T00:00:00.000Z');
  expect(query.get('is_lifetime')).toBe('eq.false');
});
