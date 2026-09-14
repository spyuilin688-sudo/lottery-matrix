import { expect, test, vi } from 'vitest';
import { listAdminTablePage, listAdminMemberPage, listAdminLoginRecordPage } from './admin-data';
import { adminBusinessDateKey, adminBusinessDateRange } from '../shared/admin-business-time';

const tables = [
  ['activationCodes', 10, 'createdAt', 'created_at'],
  ['auditLogs', 30, 'operationTime', 'operation_time'],
  ['subscriptionRecords', 30, 'paidAt', 'paid_at'],
  ['transferRequests', 30, 'submittedAt', 'submitted_at'],
  ['admins', 30, 'createdAt', 'created_at'],
  ['plans', 30, 'price', 'price'],
] as const;

test.each(tables)('%s requests only the selected sorted page and preserves the database count', async (table, pageSize, sortBy, column) => {
  const request = vi.fn();
  const items = Array.from({ length: pageSize }, (_, index) => ({ id: `page-row-${index}` }));
  const requestPage = vi.fn().mockResolvedValue({ items, total: 1105 });
  const result = await listAdminTablePage(table, { page: 3, sortBy, sortDirection: 'asc' }, { request, requestPage });
  expect(result).toMatchObject({ items, currentPage: 3, total: 1105, totalPages: Math.ceil(1105 / pageSize) });
  const query = new URL(requestPage.mock.calls[0][0], 'https://test').searchParams;
  expect(query.get('limit')).toBe(String(pageSize));
  expect(query.get('offset')).toBe(String(pageSize * 2));
  expect(query.get('order')).toBe(`${column}.asc.nullslast,id.asc`);
  expect(request).not.toHaveBeenCalled();
  expect(requestPage).toHaveBeenCalledTimes(1);
});

test.each(tables.filter(([table]) => table !== 'plans'))('%s sends inclusive Taipei calendar dates as a half-open database range', async (table, _pageSize, _sortBy, column) => {
  const requestPage = vi.fn().mockResolvedValue({ items: [], total: 0 });
  await listAdminTablePage(table, { startDate: '2026-09-14', endDate: '2026-09-14' }, { request: vi.fn(), requestPage });
  const query = new URL(requestPage.mock.calls[0][0], 'https://test').searchParams;
  expect(query.getAll(column)).toEqual(['gte.2026-09-13T16:00:00.000Z', 'lt.2026-09-14T16:00:00.000Z']);
});

test.each(['activationCodes', 'subscriptionRecords', 'transferRequests'])('%s searches related names in the database without fetching all members or plans', async table => {
  const request = vi.fn();
  const requestPage = vi.fn().mockResolvedValue({ items: [], total: 0 });
  await listAdminTablePage(table, { keyword: '月費,(x)', status: table === 'activationCodes' ? 'used' : 'confirmed' }, { request, requestPage });
  const query = new URL(requestPage.mock.calls[0][0], 'https://test').searchParams;
  expect(query.get('or')).toContain('keyword_member.not.is.null');
  expect(query.get('keyword_member.line_display_name')).toBe('imatch.月費,\\(x\\)');
  expect(query.get('select')).toContain('keyword_member:members');
  expect(query.get('status')).toBe(table === 'activationCodes' ? 'eq.used' : 'eq.confirmed');
  if (table !== 'activationCodes') {
    expect(query.get('or')).toContain('keyword_plan.not.is.null');
    expect(query.get('keyword_plan.name')).toBe('imatch.月費,\\(x\\)');
  }
  expect(request).not.toHaveBeenCalled();
});

test('safe literal keyword and status filters remain distinct for audit and administrator searches', async () => {
  const requestPage = vi.fn().mockResolvedValue({ items: [], total: 0 });
  const api = { request: vi.fn(), requestPage };
  await listAdminTablePage('auditLogs', { keyword: 'a,(b).*"' }, api);
  expect(new URL(requestPage.mock.calls[0][0], 'https://test').searchParams.get('or'))
    .toContain(`content.imatch.${JSON.stringify('a,\\(b\\)\\.\\*"')}`);
  await listAdminTablePage('admins', { keyword: 'owner', status: 'disabled' }, api);
  const query = new URL(requestPage.mock.calls[1][0], 'https://test').searchParams;
  expect(query.get('status')).toBe('eq.停用');
  expect(query.get('or')).toContain('account.imatch."owner"');
});

test('page filling respects a server cap smaller than the UI page size without skipping records', async () => {
  const rows = Array.from({ length: 95 }, (_, index) => ({ id: String(index) }));
  const requestPage = vi.fn(async (path: string) => {
    const query = new URL(path, 'https://test').searchParams;
    const offset = Number(query.get('offset'));
    return { items: rows.slice(offset, offset + Math.min(7, Number(query.get('limit')))), total: rows.length };
  });
  const result = await listAdminTablePage('auditLogs', { page: 2 }, { request: vi.fn(), requestPage });
  expect(result.items.map(row => row.id)).toEqual(rows.slice(30, 60).map(row => row.id));
  expect(requestPage.mock.calls.map(([path]) => new URL(path, 'https://test').searchParams.get('offset'))).toEqual(['30', '37', '44', '51', '58']);
});

test('deleting the final row clamps the page and reuses every filter for its count and rows', async () => {
  const requestPage = vi.fn().mockResolvedValueOnce({ items: [], total: 11 }).mockResolvedValueOnce({ items: [{ id: 'last' }], total: 11 });
  const result = await listAdminTablePage('activationCodes', { page: 9, status: 'unused', startDate: '2026-09-01', sortBy: 'expiresAt', sortDirection: 'desc' }, { request: vi.fn(), requestPage });
  expect(result).toMatchObject({ currentPage: 2, totalPages: 2, total: 11, items: [{ id: 'last' }] });
  const first = new URL(requestPage.mock.calls[0][0], 'https://test').searchParams;
  const second = new URL(requestPage.mock.calls[1][0], 'https://test').searchParams;
  expect(second.get('offset')).toBe('10');
  first.delete('offset'); second.delete('offset');
  expect(first.toString()).toBe(second.toString());
});

test.each([
  { page: 0 }, { page: 'NaN' }, { page: 1.5 }, { keyword: 'x'.repeat(201) },
  { sortBy: 'password_hash' }, { sortDirection: 'desc,id.asc' }, { startDate: '2026-02-30' },
  { startDate: '2026-10-01', endDate: '2026-09-30' }, { status: 'unknown' }, { dateField: 'password_hash' },
])('rejects invalid or unlisted query values before reading: %j', async query => {
  const requestPage = vi.fn();
  await expect(listAdminTablePage('admins', query, { request: vi.fn(), requestPage })).rejects.toMatchObject({ statusCode: 400 });
  expect(requestPage).not.toHaveBeenCalled();
});

test('existing member and login pages apply the same date and sort semantics', async () => {
  const requestPage = vi.fn().mockResolvedValue({ items: [], total: 0 });
  const api = { request: vi.fn(), requestPage };
  await listAdminMemberPage('users', { startDate: '2026-09-14', endDate: '2026-09-14', sortBy: 'registeredAt', sortDirection: 'asc' }, api);
  await listAdminLoginRecordPage({ startDate: '2026-09-14', endDate: '2026-09-14', keyword: 'operator', sortBy: 'loginAt', sortDirection: 'asc' }, api);
  for (const [index, column] of ['registered_at', 'login_at'].entries()) {
    const query = new URL(requestPage.mock.calls[index][0], 'https://test').searchParams;
    expect(query.getAll(column)).toEqual(['gte.2026-09-13T16:00:00.000Z', 'lt.2026-09-14T16:00:00.000Z']);
    expect(query.get('order')).toBe(`${column}.asc.nullslast,id.asc`);
  }
  expect(new URL(requestPage.mock.calls[1][0], 'https://test').searchParams.get('or')).toContain('account.imatch."operator"');
});

test('calendar helpers recognize Taipei midnight, leap dates and inclusive year transitions', () => {
  expect(adminBusinessDateKey('2026-12-31T16:00:00Z')).toBe('2027-01-01');
  expect(adminBusinessDateKey('invalid')).toBe('');
  expect(adminBusinessDateRange('2028-02-29', '2028-02-29')).toEqual({ start: '2028-02-28T16:00:00.000Z', endExclusive: '2028-02-29T16:00:00.000Z' });
  expect(adminBusinessDateRange('', '2026-12-31')).toEqual({ start: null, endExclusive: '2026-12-31T16:00:00.000Z' });
});

test.each(['users', 'subscriptions', 'loginRecords'])('%s fills a capped UI page without losing rows between numbered pages', async table => {
  const pageSize = table === 'loginRecords' ? 10 : 30;
  const rows = Array.from({ length: 65 }, (_, index) => ({ id: String(index), auth_user_id: null, ip: null }));
  const requestPage = vi.fn(async (path: string) => {
    const query = new URL(path, 'https://test').searchParams;
    const offset = Number(query.get('offset'));
    return { items: rows.slice(offset, offset + Math.min(3, Number(query.get('limit')))), total: rows.length };
  });
  const api = { request: vi.fn().mockResolvedValue([]), requestPage };
  const result = table === 'loginRecords'
    ? await listAdminLoginRecordPage({ page: 2 }, api)
    : await listAdminMemberPage(table, { page: 2 }, api);
  expect(result.items.map(row => row.id)).toEqual(rows.slice(pageSize, pageSize * 2).map(row => row.id));
});

test.each(['users', 'subscriptions', 'loginRecords', 'activationCodes', 'auditLogs', 'subscriptionRecords', 'transferRequests', 'admins', 'plans'])('%s keeps pages beyond 100000 accessible and rejects only unsafe page arithmetic', async table => {
  const pageSize = ['activationCodes', 'loginRecords'].includes(table) ? 10 : 30;
  for (const page of [100001, Math.floor(Number.MAX_SAFE_INTEGER / pageSize)]) {
    const total = (page - 1) * pageSize + 1;
    const requestPage = vi.fn().mockResolvedValue({ items: [{ id: 'last' }], total });
    const result = await listAdminTablePage(table, { page }, { request: vi.fn().mockResolvedValue([]), requestPage });
    expect(result).toMatchObject({ currentPage: page, totalPages: page, total, items: [{ id: 'last' }] });
    expect(new URL(requestPage.mock.calls[0][0], 'https://test').searchParams.get('offset')).toBe(String((page - 1) * pageSize));
  }
  const requestPage = vi.fn();
  await expect(listAdminTablePage(table, { page: Math.floor(Number.MAX_SAFE_INTEGER / pageSize) + 1 }, { request: vi.fn(), requestPage })).rejects.toMatchObject({ statusCode: 400 });
  expect(requestPage).not.toHaveBeenCalled();
});

test('subscription name search keeps its eligible current plan separate from the empty search embed', async () => {
  const request = vi.fn();
  const requestPage = vi.fn().mockResolvedValue({ items: [], total: 0 });
  await listAdminMemberPage('subscriptions', { keyword: '季費', plan: 'quarterly', status: 'active' }, { request, requestPage }, new Date('2026-09-14T00:00:00Z'));
  const query = new URL(requestPage.mock.calls[0][0], 'https://test').searchParams;
  expect(query.get('select')).toContain('current_plan:plans!members_current_plan_id_fkey!inner(name,price,duration_days)');
  expect(query.get('select')).toContain('keyword_plan:plans!members_current_plan_id_fkey()');
  expect(query.get('current_plan.duration_days')).toBe('eq.90');
  expect(query.get('keyword_plan.name')).toBe('imatch.季費');
  expect(query.has('current_plan.name')).toBe(false);
  expect(query.get('plan_expires_at')).toBe('gt.2026-09-14T00:00:00.000Z');
  expect(query.get('is_lifetime')).toBe('eq.false');
  expect(query.get('and')).toBe('(or(status.in.(active,啟用),status.is.null))');
  expect(query.get('or')).toContain('keyword_plan.not.is.null');
  expect(request).not.toHaveBeenCalled();
});
