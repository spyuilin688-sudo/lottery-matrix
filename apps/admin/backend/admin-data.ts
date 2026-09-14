import { adminBusinessDateKey, adminBusinessDateRange } from '../shared/admin-business-time';
import { lookupLocations, memberConnectionSummaries } from './member-login-history';
type Requester = {
  request<T = unknown>(path: string, init?: RequestInit): Promise<T>;
  requestPage?<T = unknown>(path: string): Promise<{ items: T[]; total: number }>;
};

type WriteTransport = {
  supabaseRequest<T = unknown>(path: string, init?: RequestInit): Promise<T>;
  selectRows<T = unknown>(table: string, query: string): Promise<T[]>;
  insertRows<T = unknown>(table: string, rows: unknown[]): Promise<T[]>;
  updateRows<T = unknown>(table: string, query: string, record: unknown): Promise<T[]>;
  deleteRows<T = unknown>(table: string, query: string): Promise<T[]>;
};

export type AdminActor = { id: string; account: string; name: string; role?: string };
export type AdminAccountInput = {
  account: string;
  name: string;
  role: string;
  status: string;
  can_view: boolean;
  can_add: boolean;
  can_edit: boolean;
  can_delete: boolean;
  password_salt?: string;
  password_hash?: string;
};
export type SubscriptionAction = {
  action: 'activate' | 'renew' | 'cancel' | 'adjustExpiry' | 'lifetime';
  planId?: string;
  expiresAt?: string;
};

type Row = Record<string, unknown>;
type TableDefinition = {
  path: string;
  map(row: Row): Row & { id: string };
};

export class AdminDataError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'AdminDataError';
    this.statusCode = statusCode;
  }
}

const definitions: Record<string, TableDefinition> = {
  users: {
    path: '/rest/v1/members?select=id,auth_user_id,line_display_name,registered_at,current_plan_id,plan_started_at,plan_expires_at,is_lifetime,auto_renew,status,referral_code,invitation_code,last_online_at,total_online_seconds,online_session_count,current_plan:plans!members_current_plan_id_fkey(name,price,duration_days)&order=registered_at.desc,id.asc',
    map: (row) => ({
      id: String(row.id),
      authUserId: row.auth_user_id,
      lineDisplayName: row.line_display_name,
      registeredAt: row.registered_at,
      currentPlanId: row.current_plan_id,
      planStartedAt: row.plan_started_at,
      planExpiresAt: row.plan_expires_at,
      isLifetime: row.is_lifetime,
      autoRenew: row.auto_renew,
      status: row.status,
      referralCode: row.referral_code,
      invitationCode: row.invitation_code,
      planName: (row.current_plan as Row | null)?.name ?? null,
      lastOnlineAt: row.last_online_at,
    }),
  },
  subscriptions: {
    path: '/rest/v1/members?select=id,auth_user_id,line_display_name,registered_at,current_plan_id,plan_started_at,plan_expires_at,is_lifetime,auto_renew,status,referral_code,invitation_code,last_online_at,total_online_seconds,online_session_count,current_plan:plans!members_current_plan_id_fkey!inner(name,price,duration_days)&order=plan_started_at.desc.nullslast,id.asc',
    map: (row) => {
      const plan = (row.current_plan ?? null) as Row | null;
      return {
        id: String(row.id),
        authUserId: row.auth_user_id,
        lineDisplayName: row.line_display_name,
        registeredAt: row.registered_at,
        currentPlanId: row.current_plan_id,
        planName: plan?.name ?? null,
        planPrice: plan?.price ?? null,
        planDurationDays: plan?.duration_days ?? null,
        planStartedAt: row.plan_started_at,
        planExpiresAt: row.plan_expires_at,
        isLifetime: row.is_lifetime,
        autoRenew: row.auto_renew,
        status: row.status,
        referralCode: row.referral_code,
        invitationCode: row.invitation_code,
        lastOnlineAt: row.last_online_at,
      };
    },
  },
  loginRecords: {
    path: `/rest/v1/admin_login_records?select=id,admin_id,account,login_at,logout_at,online_minutes,ip,device,admin_account:admin_accounts!inner(role)&admin_account.role=neq.${encodeURIComponent('超級管理員')}&order=login_at.desc,id.asc`,
    map: (row) => ({
      id: String(row.id),
      adminId: row.admin_id,
      account: row.account,
      loginAt: row.login_at,
      logoutAt: row.logout_at,
      onlineMinutes: row.online_minutes,
      ip: row.ip,
      device: row.device,
    }),
  },
  subscriptionRecords: {
    path: '/rest/v1/payments?select=id,member_id,plan_id,amount,paid_at,status,reversed_at,reversal_reason,reversed_by,reversed_by_name,plan:plans(name),member:members(line_display_name)&order=paid_at.desc.nullslast,id.asc',
    map: (row) => ({
      id: String(row.id),
      memberId: row.member_id,
      lineDisplayName: (row.member as Row | null)?.line_display_name ?? null,
      planId: row.plan_id,
      planName: (row.plan as Row | null)?.name ?? null,
      amount: row.amount,
      paidAt: row.paid_at,
      status: row.status,
      reversedAt: row.reversed_at,
      reversalReason: row.reversal_reason,
      reversedBy: row.reversed_by,
      reversedByName: row.reversed_by_name,
    }),
  },
  auditLogs: {
    path: '/rest/v1/audit_logs?select=id,operation_time,admin_id,admin,operation_type,target_table,target_id,content,before_data,after_data,ip,device&order=operation_time.desc,id.asc',
    map: (row) => ({
      id: String(row.id),
      operationTime: row.operation_time,
      adminId: row.admin_id,
      admin: row.admin,
      operationType: row.operation_type,
      targetTable: row.target_table,
      targetId: row.target_id,
      content: row.content,
      beforeData: row.before_data,
      afterData: row.after_data,
      ip: row.ip,
      device: row.device,
    }),
  },
  admins: {
    path: '/rest/v1/admin_accounts?select=id,account,name,role,status,can_view,can_add,can_edit,can_delete,last_login_at,created_at&order=created_at.asc,id.asc',
    map: (row) => ({
      id: String(row.id),
      account: row.account,
      name: row.name,
      role: row.role,
      status: row.status,
      permissions: {
        view: Boolean(row.can_view),
        add: Boolean(row.can_add),
        edit: Boolean(row.can_edit),
        delete: Boolean(row.can_delete),
      },
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
    }),
  },
  activationCodes: {
    path: '/rest/v1/activation_codes?select=id,batch_id,code,duration_type,created_at,expires_at,redeemed_at,status,redeemed_member:members!activation_codes_redeemed_by_member_id_fkey(line_display_name)&order=created_at.desc,id.asc',
    map: (row) => ({
      id: String(row.id),
      batchId: row.batch_id,
      code: row.code,
      durationType: row.duration_type,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      redeemedByLineDisplayName: (row.redeemed_member as Row | null)?.line_display_name ?? null,
      redeemedAt: row.redeemed_at,
      status: row.status,
    }),
  },
  plans: {
    path: '/rest/v1/plans?select=id,name,price,duration_days&order=duration_days.asc,id.asc',
    map: (row) => ({
      id: String(row.id),
      name: row.name,
      price: row.price,
      durationDays: row.duration_days,
    }),
  },
  transferRequests: {
    path: '/rest/v1/transfer_requests?select=id,member_id,plan_id,amount,transferred_at,account_last_five,submitted_at,status,plan:plans(name),member:members(line_display_name)&order=submitted_at.desc,id.asc',
    map: (row) => ({
      id: String(row.id),
      memberId: row.member_id,
      lineDisplayName: (row.member as Row | null)?.line_display_name ?? null,
      planId: row.plan_id,
      planName: (row.plan as Row | null)?.name ?? null,
      amount: row.amount,
      transferredAt: row.transferred_at,
      accountLastFive: row.account_last_five,
      submittedAt: row.submitted_at,
      status: row.status,
    }),
  },
};

export function getAdminTableDefinition(table: string): TableDefinition {
  const definition = definitions[table];
  if (!definition) throw new AdminDataError('Invalid table');
  return definition;
}

const adminReadPageSize = 1000;

async function listAllRows(api: Requester, path: string) {
  const rows: Row[] = [];
  for (;;) {
    const page = await api.request<Row[]>(`${path}&limit=${adminReadPageSize}&offset=${rows.length}`);
    // A server row cap can return a short page before the result ends.
    // Advance by the actual count and stop only on an empty page.
    if (page.length === 0) return rows;
    rows.push(...page);
  }
}

async function enrichLoginRecords(items: Array<Row & { id: string }>, api: Requester) {
  const ips = items.map(item => typeof item.ip === 'string' ? item.ip : null);
  const locations = await lookupLocations(ips, api).catch(() => new Map<string, string | null>());
  return items.map(item => ({ ...item, estimatedRegion: typeof item.ip === 'string' ? locations.get(item.ip) || null : null }));
}

export async function listAdminTable(table: string, api: Requester, currentDate = new Date()) {
  const definition = getAdminTableDefinition(table);
  const rows = await listAllRows(api, definition.path);
  const items = rows.map(definition.map);
  if (table === 'loginRecords') {
    return { items: await enrichLoginRecords(items, api) };
  }
  if (table !== 'users' && table !== 'subscriptions') return { items };
  return { items: await enrichMembers(items, api, currentDate) };
}

async function enrichMembers(items: Array<Row & { id: string }>, api: Requester, currentDate: Date, scopeMembers = false) {
  if (!items.length) return [];
  const connections = await memberConnectionSummaries(items.map(item => String(item.authUserId ?? '')), api);
  const since = new Date(currentDate.getTime() - 3 * 86_400_000).toISOString();
  const memberFilter = scopeMembers ? `&member_id=in.(${items.map(item => encodeURIComponent(item.id)).join(',')})` : '';
  const sessions = await listAllRows(api, `/rest/v1/member_online_sessions?select=member_id,online_seconds&started_at=gte.${encodeURIComponent(since)}&order=id.asc${memberFilter}`);
  const secondsByMember = new Map<string, number>();
  for (const session of sessions) {
    const memberId = String(session.member_id ?? '');
    if (!memberId) continue;
    secondsByMember.set(memberId, (secondsByMember.get(memberId) ?? 0) + Math.max(0, Number(session.online_seconds ?? 0)));
  }
  return items.map((item) => ({ ...item, ...(connections.get(String(item.authUserId)) ?? { recentIp: null, estimatedRegion: null }), recentOnlineMinutes: Math.round((secondsByMember.get(String(item.id)) ?? 0) / 60) }));
}

type PageRequester = Requester & {
  requestPage<T = unknown>(path: string): Promise<{ items: T[]; total: number }>;
};

export type AdminPageQuery = {
  page?: unknown; keyword?: unknown; status?: unknown; plan?: unknown;
  startDate?: unknown; endDate?: unknown; dateField?: unknown;
  sortBy?: unknown; sortDirection?: unknown;
};

type PageDefinition = {
  pageSize: number;
  columns: Record<string, string>;
  dates: string[];
  keywords: string[];
  statuses?: string[];
  numeric?: string[];
  identifiers?: string[];
  relations?: Array<{ alias: string; relation: string; field: string }>;
};

const memberColumns = {
  id: 'id', lineDisplayName: 'line_display_name', registeredAt: 'registered_at', status: 'status',
  planName: 'current_plan(name)', planStartedAt: 'plan_started_at', planExpiresAt: 'plan_expires_at',
  lastOnlineAt: 'last_online_at', referralCode: 'referral_code', invitationCode: 'invitation_code',
};
const pageDefinitions: Record<string, PageDefinition> = {
  users: { pageSize: 30, columns: memberColumns, dates: ['registeredAt', 'planStartedAt', 'planExpiresAt', 'lastOnlineAt'], keywords: ['line_display_name', 'referral_code', 'invitation_code'], identifiers: ['auth_user_id'], relations: [{ alias: 'keyword_plan', relation: 'plans!members_current_plan_id_fkey', field: 'name' }] },
  subscriptions: { pageSize: 30, columns: memberColumns, dates: ['planStartedAt', 'planExpiresAt', 'registeredAt', 'lastOnlineAt'], keywords: ['line_display_name', 'referral_code', 'invitation_code'], identifiers: ['auth_user_id'], relations: [{ alias: 'keyword_plan', relation: 'plans!members_current_plan_id_fkey', field: 'name' }] },
  loginRecords: {
    pageSize: 10, columns: { id: 'id', account: 'account', loginAt: 'login_at', logoutAt: 'logout_at', onlineMinutes: 'online_minutes', ip: 'ip', device: 'device' },
    dates: ['loginAt', 'logoutAt'], keywords: ['account', 'ip', 'device'], numeric: ['online_minutes'], identifiers: ['admin_id'],
  },
  activationCodes: {
    pageSize: 10,
    columns: { id: 'id', batchId: 'batch_id', code: 'code', durationType: 'duration_type', createdAt: 'created_at', expiresAt: 'expires_at', redeemedAt: 'redeemed_at', status: 'status', redeemedByLineDisplayName: 'redeemed_member(line_display_name)' },
    dates: ['createdAt', 'expiresAt', 'redeemedAt'], keywords: ['code', 'duration_type', 'status'], identifiers: ['batch_id'],
    statuses: ['unused', 'used', 'expired'],
    relations: [{ alias: 'keyword_member', relation: 'members!activation_codes_redeemed_by_member_id_fkey', field: 'line_display_name' }],
  },
  auditLogs: {
    pageSize: 30,
    columns: { id: 'id', operationTime: 'operation_time', admin: 'admin', operationType: 'operation_type', targetTable: 'target_table', targetId: 'target_id', content: 'content', ip: 'ip', device: 'device' },
    dates: ['operationTime'], keywords: ['admin', 'operation_type', 'target_table', 'target_id', 'content', 'ip', 'device'], identifiers: ['admin_id'],
  },
  subscriptionRecords: {
    pageSize: 30,
    columns: { id: 'id', memberId: 'member_id', planId: 'plan_id', lineDisplayName: 'member(line_display_name)', planName: 'plan(name)', amount: 'amount', paidAt: 'paid_at', status: 'status', reversedAt: 'reversed_at', reversalReason: 'reversal_reason', reversedByName: 'reversed_by_name' },
    dates: ['paidAt', 'reversedAt'], keywords: ['status', 'reversal_reason', 'reversed_by_name'], numeric: ['amount'], identifiers: ['member_id', 'plan_id'],
    statuses: ['pending', 'confirmed', 'rejected', 'refunded', 'chargeback', 'cancelled'],
    relations: [{ alias: 'keyword_member', relation: 'members', field: 'line_display_name' }, { alias: 'keyword_plan', relation: 'plans', field: 'name' }],
  },
  transferRequests: {
    pageSize: 30,
    columns: { id: 'id', memberId: 'member_id', planId: 'plan_id', lineDisplayName: 'member(line_display_name)', planName: 'plan(name)', amount: 'amount', transferredAt: 'transferred_at', submittedAt: 'submitted_at', accountLastFive: 'account_last_five', status: 'status' },
    dates: ['submittedAt', 'transferredAt'], keywords: ['account_last_five', 'status'], numeric: ['amount'], identifiers: ['member_id', 'plan_id'],
    statuses: ['pending', 'confirmed', 'rejected'],
    relations: [{ alias: 'keyword_member', relation: 'members', field: 'line_display_name' }, { alias: 'keyword_plan', relation: 'plans', field: 'name' }],
  },
  admins: {
    pageSize: 30,
    columns: { id: 'id', account: 'account', name: 'name', role: 'role', status: 'status', createdAt: 'created_at', lastLoginAt: 'last_login_at' },
    dates: ['createdAt', 'lastLoginAt'], keywords: ['account', 'name', 'role', 'status'], statuses: ['啟用', '停用', 'active', 'disabled'],
  },
  plans: {
    pageSize: 30, columns: { id: 'id', name: 'name', price: 'price', durationDays: 'duration_days' },
    dates: [], keywords: ['name'], numeric: ['price', 'duration_days'],
  },
};

function parsePage(query: AdminPageQuery, pageSize: number) {
  const page = Number(query.page ?? 1);
  const offset = (page - 1) * pageSize;
  // The only numeric ceiling is exact JavaScript integer arithmetic. Every
  // numbered page remains available while all offsets within it are safe.
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(offset)
    || !Number.isSafeInteger(offset + pageSize - 1)) throw new AdminDataError('查詢條件不正確');
  return page;
}

function applyAdminPageFilters(url: URL, table: string, query: AdminPageQuery, filterStatus = true) {
  const config = pageDefinitions[table];
  if (!config) throw new AdminDataError('Invalid table');
  const keyword = String(query.keyword ?? '').trim();
  const sortBy = String(query.sortBy ?? '');
  const direction = String(query.sortDirection ?? 'desc');
  const startDate = String(query.startDate ?? '');
  const endDate = String(query.endDate ?? '');
  const dateField = String(query.dateField ?? config.dates[0] ?? '');
  if (keyword.length > 200 || (sortBy && !Object.prototype.hasOwnProperty.call(config.columns, sortBy))
    || !['asc', 'desc'].includes(direction) || (dateField && !config.dates.includes(dateField))
    || ((startDate || endDate) && !dateField)) throw new AdminDataError('查詢條件不正確');
  if (sortBy) {
    const column = config.columns[sortBy];
    url.searchParams.set('order', `${column}.${direction}.nullslast${column === 'id' ? '' : ',id.asc'}`);
  }
  try {
    const range = adminBusinessDateRange(startDate, endDate);
    const column = config.columns[dateField];
    if (range.start) url.searchParams.append(column, `gte.${range.start}`);
    if (range.endExclusive) url.searchParams.append(column, `lt.${range.endExclusive}`);
  } catch {
    throw new AdminDataError('日期範圍不正確');
  }
  const status = String(query.status ?? 'all');
  if (filterStatus && status !== 'all') {
    if (!config.statuses?.includes(status)) throw new AdminDataError('查詢條件不正確');
    const storedStatus = table === 'admins' ? ({ active: '啟用', disabled: '停用' }[status] ?? status) : status;
    url.searchParams.set('status', `eq.${storedStatus}`);
  }
  if (!keyword) return;
  const pattern = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const clauses = config.keywords.map(field => `${field}.imatch.${JSON.stringify(pattern)}`);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(keyword)) {
    clauses.push(...['id', ...(config.identifiers ?? [])].map(field => `${field}.eq.${keyword}`));
  }
  if (/^\d+$/.test(keyword) && Number.isSafeInteger(Number(keyword))) {
    clauses.push(...(config.numeric ?? []).map(field => `${field}.eq.${Number(keyword)}`));
  }
  for (const relation of config.relations ?? []) {
    // Empty search embeds filter the parent OR group without removing the
    // separately selected display-name embeds from matching rows.
    url.searchParams.set('select', `${url.searchParams.get('select')},${relation.alias}:${relation.relation}()`);
    url.searchParams.set(`${relation.alias}.${relation.field}`, `imatch.${pattern}`);
    clauses.push(`${relation.alias}.not.is.null`);
  }
  url.searchParams.set('or', `(${clauses.join(',')})`);
}

async function readAdminPage(url: URL, page: number, pageSize: number, api: PageRequester) {
  const read = async (currentPage: number) => {
    const offset = (currentPage - 1) * pageSize;
    const items: Row[] = [];
    let total = 0;
    do {
      url.searchParams.set('limit', String(pageSize - items.length));
      url.searchParams.set('offset', String(offset + items.length));
      const result = await api.requestPage<Row>(url.pathname + url.search);
      total = result.total;
      if (!result.items.length) break;
      items.push(...result.items);
    } while (items.length < pageSize && offset + items.length < total);
    return { items, total };
  };
  let result = await read(page);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(result.total / pageSize)));
  if (currentPage !== page) result = await read(currentPage);
  return { ...result, currentPage, totalPages: Math.max(1, Math.ceil(result.total / pageSize)) };
}

export async function listAdminTablePage(table: string, query: AdminPageQuery, api: PageRequester) {
  const definition = getAdminTableDefinition(table);
  if (table === 'users' || table === 'subscriptions') return listAdminMemberPage(table, query, api);
  if (table === 'loginRecords') return listAdminLoginRecordPage(query, api);
  const page = parsePage(query, pageDefinitions[table].pageSize);
  const url = new URL(definition.path, 'https://supabase.invalid');
  applyAdminPageFilters(url, table, query);
  const result = await readAdminPage(url, page, pageDefinitions[table].pageSize, api);
  return { ...result, items: result.items.map(definition.map) };
}

const adminLoginRecordPageSize = 10;

export async function listAdminLoginRecordPage(query: AdminPageQuery, api: PageRequester) {
  const page = parsePage(query, adminLoginRecordPageSize);
  const definition = getAdminTableDefinition('loginRecords');
  const url = new URL(definition.path, 'https://supabase.invalid');
  applyAdminPageFilters(url, 'loginRecords', query);
  const result = await readAdminPage(url, page, adminLoginRecordPageSize, api);
  const items = await enrichLoginRecords(result.items.map(definition.map), api);
  return { ...result, items };
}

export async function listAdminMemberPage(
  table: string,
  query: AdminPageQuery,
  api: PageRequester,
  currentDate = new Date(),
) {
  const page = parsePage(query, 30);
  const keyword = String(query.keyword ?? '').trim();
  const status = String(query.status ?? 'all');
  const plan = String(query.plan ?? 'all');
  const planDurations: Record<string, number> = { monthly: 30, quarterly: 90, yearly: 365 };
  if (!['users', 'subscriptions'].includes(table)
      || keyword.length > 200 || !['all', 'active', 'disabled'].includes(status)
      || !['all', ...Object.keys(planDurations)].includes(plan)
      || (table === 'users' && plan !== 'all')) {
    throw new AdminDataError('查詢條件不正確');
  }
  const definition = getAdminTableDefinition(table);
  const url = new URL(definition.path, 'https://supabase.invalid');
  if (table === 'subscriptions') {
    url.searchParams.set('current_plan.duration_days', plan === 'all' ? 'in.(30,90,365)' : `eq.${planDurations[plan]}`);
    url.searchParams.set('plan_expires_at', `gt.${currentDate.toISOString()}`);
    url.searchParams.set('is_lifetime', 'eq.false');
  }
  if (status === 'disabled') {
    url.searchParams.set('status', 'in.(disabled,inactive,停用)');
  } else if (table === 'subscriptions' || status === 'active') {
    // Legacy members have NULL status. Keep the enabled-status group separate
    // from the keyword OR group so searching cannot replace either filter.
    url.searchParams.set('and', '(or(status.in.(active,啟用),status.is.null))');
  }
  applyAdminPageFilters(url, table, query, false);
  const result = await readAdminPage(url, page, 30, api);
  const items = await enrichMembers(result.items.map(definition.map), api, currentDate, true);
  return { ...result, items };
}

const dashboardPaymentPageSize = 1000;

async function listDashboardPayments(api: Requester, resetFilter: string) {
  const rows: Row[] = [];
  for (;;) {
    const path = `/rest/v1/payments?select=id,amount,paid_at,status&status=eq.confirmed${resetFilter}&order=paid_at.asc,id.asc&limit=${dashboardPaymentPageSize}&offset=${rows.length}`;
    const result = api.requestPage ? await api.requestPage<Row>(path) : null;
    const page = result ? result.items : await api.request<Row[]>(path);
    if (page.length === 0) return rows;
    rows.push(...page);
    // Supabase's configured row cap may be lower than our requested page size.
    if (result && rows.length >= result.total) return rows;
  }
}

export async function getDashboard(api: Requester, currentDate = new Date()) {
  const settings = await api.request<Row[]>('/rest/v1/admin_revenue_settings?select=reset_at&id=eq.1&limit=1');
  const storedResetAt = typeof settings[0]?.reset_at === 'string'
    ? new Date(settings[0].reset_at)
    : null;
  const resetTime = storedResetAt && Number.isFinite(storedResetAt.getTime())
    ? storedResetAt.getTime()
    : null;
  const resetFilter = resetTime === null
    ? ''
    : `&paid_at=gte.${encodeURIComponent(new Date(resetTime).toISOString())}`;
  const [members, paymentRows, visitorStats] = await Promise.all([
    listAllRows(api, '/rest/v1/members?select=plan_expires_at,status,current_plan:plans!members_current_plan_id_fkey(duration_days)&order=id.asc'),
    listDashboardPayments(api, resetFilter),
    api.request<{ todayVisitors: number; monthVisitors: number; totalVisitors: number }>('/rest/v1/rpc/admin_visitor_stats', { method: 'POST', body: '{}' }).catch(() => null),
  ]);
  const payments = paymentRows
    .filter((row) => row.status === 'confirmed'
      && typeof row.paid_at === 'string'
      && (resetTime === null || new Date(row.paid_at).getTime() >= resetTime))
    .map((row) => ({
      amount: Number(row.amount ?? 0),
      paidAt: adminBusinessDateKey(String(row.paid_at)),
    }));
  const duration = (member: Row) => Number((member.current_plan as Row | null)?.duration_days ?? 0);
  const hasCurrentFixedDurationPlan = (member: Row) => {
    if (typeof member.plan_expires_at !== 'string') return false;
    const expiresAt = new Date(member.plan_expires_at).getTime();
    return Number.isFinite(expiresAt)
      && expiresAt > currentDate.getTime()
      && !['停用', 'disabled', 'inactive'].includes(String(member.status ?? ''));
  };
  const today = adminBusinessDateKey(currentDate);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const quarter = Math.floor((Number(today.slice(5, 7)) - 1) / 3);
  const sum = (predicate: (payment: { amount: number; paidAt: string }) => boolean) =>
    payments.filter(predicate).reduce((total, payment) => total + payment.amount, 0);
  const expiresWithinSevenDays = members.filter((member) => {
    if (typeof member.plan_expires_at !== 'string') return false;
    const expiresAt = new Date(member.plan_expires_at);
    const remaining = expiresAt.getTime() - currentDate.getTime();
    return Number.isFinite(remaining) && remaining >= 0 && remaining <= 7 * 86_400_000;
  }).length;

  return {
    todayVisitors: visitorStats?.todayVisitors ?? null,
    monthVisitors: visitorStats?.monthVisitors ?? null,
    totalVisitors: visitorStats?.totalVisitors ?? null,
    totalUsers: members.length,
    monthlyPro: members.filter((member) => hasCurrentFixedDurationPlan(member) && duration(member) === 30).length,
    quarterlyPro: members.filter((member) => hasCurrentFixedDurationPlan(member) && duration(member) === 90).length,
    yearlyPro: members.filter((member) => hasCurrentFixedDurationPlan(member) && duration(member) === 365).length,
    expiring: expiresWithinSevenDays,
    todayRevenue: sum((payment) => payment.paidAt.startsWith(today)),
    monthRevenue: sum((payment) => payment.paidAt.startsWith(month)),
    quarterRevenue: sum((payment) => {
      return payment.paidAt.startsWith(year)
        && Math.floor((Number(payment.paidAt.slice(5, 7)) - 1) / 3) === quarter;
    }),
    yearRevenue: sum((payment) => payment.paidAt.startsWith(year)),
    cumulativeRevenue: sum(() => true),
  };
}

const adminRoles = ['超級管理員', '營運管理員', '查看人員'];
const adminStatuses = ['啟用', '停用'];
const durationTypes = ['7_days', '15_days', '30_days', '60_days', '90_days', '365_days', 'lifetime'];
const activationCodeQuantities = [1, 3, 5, 10, 20];
const operatorActivationCodeDurations = ['7_days', '15_days'];
const paymentReversalStatuses = ['refunded', 'chargeback', 'cancelled'];
export const paymentReversalReasonMaxLength = 500;

function validateAdminInput(input: AdminAccountInput) {
  if (!input.account.trim() || !input.name.trim()) throw new AdminDataError('管理員帳號與名稱必填');
  if (!adminRoles.includes(input.role)) throw new AdminDataError('角色不正確');
  if (!adminStatuses.includes(input.status)) throw new AdminDataError('帳號狀態不正確');
  const permissions = input.role === '超級管理員'
    ? { can_view: true, can_add: true, can_edit: true, can_delete: true }
    : {
        can_view: Boolean(input.can_view),
        can_add: Boolean(input.can_add),
        can_edit: Boolean(input.can_edit),
        can_delete: Boolean(input.can_delete),
      };
  return {
    account: input.account.trim().toLowerCase(),
    name: input.name.trim(),
    role: input.role,
    status: input.status,
    ...permissions,
    ...(input.password_salt && input.password_hash ? { password_salt: input.password_salt, password_hash: input.password_hash } : {}),
  };
}

function safeAdminAuditRow(row: Row) {
  const safe = { ...row };
  delete safe.password_salt;
  delete safe.password_hash;
  return safe;
}

export function createAdminData(transport: WriteTransport) {
  async function protectLastEnabledSuper(before: Row, next?: { role: string; status: string }) {
    if (before.role !== '超級管理員' || before.status !== '啟用') return;
    if (next?.role === '超級管理員' && next.status === '啟用') return;
    const enabled = await transport.selectRows<Row>(
      'admin_accounts',
      `select=id&role=eq.${encodeURIComponent('超級管理員')}&status=eq.${encodeURIComponent('啟用')}`,
    );
    const otherEnabled = enabled.some((row) => String(row.id) !== String(before.id));
    if (!otherEnabled) throw new AdminDataError('系統必須保留至少一位啟用中的超級管理員');
  }

  async function writeAudit(entry: {
    actor: AdminActor;
    operationType: string;
    targetTable: string;
    targetId?: string | null;
    content?: string | null;
    beforeData?: unknown;
    afterData?: unknown;
    ip?: string | null;
    device?: string | null;
  }) {
    if (entry.actor.role === '超級管理員') return;
    await transport.insertRows('audit_logs', [{
      admin_id: entry.actor.id,
      admin: entry.actor.name || entry.actor.account,
      operation_type: entry.operationType,
      target_table: entry.targetTable,
      target_id: entry.targetId ?? null,
      content: entry.content ?? null,
      before_data: entry.beforeData ?? null,
      after_data: entry.afterData ?? null,
      ip: entry.ip ?? null,
      device: entry.device ?? null,
    }]);
  }

  async function createAdminAccount(input: AdminAccountInput, actor: AdminActor) {
    if (!input.password_salt || !input.password_hash) throw new AdminDataError('管理員密碼必填');
    const record = validateAdminInput(input);
    const [created] = await transport.insertRows<Row>('admin_accounts', [record]);
    if (!created) throw new AdminDataError('建立管理員失敗', 500);
    await writeAudit({
      actor,
      operationType: '新增',
      targetTable: 'admin_accounts',
      targetId: String(created.id),
      content: '新增管理員帳號',
      afterData: safeAdminAuditRow(created),
    });
    return definitions.admins.map(created);
  }

  async function updateAdminAccount(id: string, input: AdminAccountInput, actor: AdminActor) {
    const [before] = await transport.selectRows<Row>('admin_accounts', `select=*&id=eq.${encodeURIComponent(id)}`);
    if (!before) throw new AdminDataError('Not found', 404);
    const record = validateAdminInput(input);
    await protectLastEnabledSuper(before, { role: record.role, status: record.status });
    const [updated] = await transport.updateRows<Row>('admin_accounts', `id=eq.${encodeURIComponent(id)}`, record);
    if (!updated) throw new AdminDataError('更新管理員失敗', 500);
    await writeAudit({
      actor,
      operationType: '修改',
      targetTable: 'admin_accounts',
      targetId: id,
      content: '修改管理員帳號',
      beforeData: safeAdminAuditRow(before),
      afterData: safeAdminAuditRow(updated),
    });
    return definitions.admins.map(updated);
  }

  async function updateOwnAdminName(name: string, actor: AdminActor) {
    const normalizedName = name.trim();
    if (!normalizedName) throw new AdminDataError('管理員名稱必填');
    const query = `id=eq.${encodeURIComponent(actor.id)}`;
    const [before] = await transport.selectRows<Row>('admin_accounts', `select=*&${query}`);
    if (!before) throw new AdminDataError('Not found', 404);
    const [updated] = await transport.updateRows<Row>('admin_accounts', query, {
      name: normalizedName,
    });
    if (!updated) throw new AdminDataError('更新管理員名稱失敗', 500);
    await writeAudit({
      actor,
      operationType: '修改',
      targetTable: 'admin_accounts',
      targetId: actor.id,
      content: '修改本人管理員名稱',
      beforeData: safeAdminAuditRow(before),
      afterData: safeAdminAuditRow(updated),
    });
    return definitions.admins.map(updated);
  }

  async function updateMemberStatus(id: string, status: string, actor: AdminActor) {
    if (!['active', 'disabled'].includes(status)) throw new AdminDataError('會員狀態不正確');
    return transport.supabaseRequest<Row>('rpc/admin_set_member_status', {
      method: 'POST',
      body: JSON.stringify({
        p_member_id: id,
        p_status: status,
        p_actor_id: actor.id,
        p_actor_name: actor.name || actor.account,
      }),
    });
  }

  async function updateSubscription(
    id: string,
    input: SubscriptionAction,
    actor: AdminActor,
    currentDate = new Date(),
  ) {
    if (!['activate', 'renew', 'cancel', 'adjustExpiry', 'lifetime'].includes(input.action)) {
      throw new AdminDataError('訂閱操作不正確');
    }
    const planId = String(input.planId ?? '').trim() || null;
    if ((input.action === 'activate' || input.action === 'renew') && !planId) {
      throw new AdminDataError('訂閱方案必填');
    }
    let expiresAt: string | null = null;
    if (input.action === 'adjustExpiry') {
      const expiry = new Date(String(input.expiresAt ?? ''));
      if (!Number.isFinite(expiry.getTime())) throw new AdminDataError('到期時間不正確');
      expiresAt = expiry.toISOString();
    }
    return transport.supabaseRequest<Row>('rpc/admin_update_subscription', {
      method: 'POST',
      body: JSON.stringify({
        p_member_id: id,
        p_action: input.action,
        p_plan_id: planId,
        p_expires_at: expiresAt,
        p_now: currentDate.toISOString(),
        p_actor_id: actor.id,
        p_actor_name: actor.name || actor.account,
      }),
    });
  }

  async function reviewTransferRequest(
    id: string,
    decision: string,
    actor: AdminActor,
    currentDate = new Date(),
  ) {
    if (!['confirmed', 'rejected'].includes(decision)) throw new AdminDataError('審核結果不正確');
    return transport.supabaseRequest<Row>('rpc/admin_review_transfer_request', {
      method: 'POST',
      body: JSON.stringify({
        p_transfer_id: id,
        p_decision: decision,
        p_now: currentDate.toISOString(),
        p_actor_id: actor.id,
        p_actor_name: actor.name || actor.account,
      }),
    });
  }

  async function recordPaymentReversal(
    id: string,
    status: string,
    reason: string,
    actor: AdminActor,
  ) {
    const paymentId = id.trim();
    const reversalReason = reason.trim();
    if (!paymentId) throw new AdminDataError('付款紀錄必填');
    if (!paymentReversalStatuses.includes(status)) throw new AdminDataError('沖銷狀態不正確');
    if (!reversalReason) throw new AdminDataError('沖銷原因必填');
    if (Array.from(reversalReason).length > paymentReversalReasonMaxLength) {
      throw new AdminDataError(`沖銷原因不可超過 ${paymentReversalReasonMaxLength} 字`);
    }
    return transport.supabaseRequest<Row>('rpc/admin_record_payment_reversal', {
      method: 'POST',
      body: JSON.stringify({
        p_payment_id: paymentId,
        p_status: status,
        p_reason: reversalReason,
        p_actor_id: actor.id,
        p_actor_name: actor.name || actor.account,
      }),
    });
  }

  async function resetRevenue(actor: AdminActor) {
    if (actor.role !== '超級管理員') {
      throw new AdminDataError('僅超級管理員可重設收入', 403);
    }
    const [saved] = await transport.supabaseRequest<Row[]>('rpc/admin_reset_revenue_baseline', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const savedResetAt = typeof saved?.reset_at === 'string' ? new Date(saved.reset_at) : null;
    if (!savedResetAt || !Number.isFinite(savedResetAt.getTime())) {
      throw new AdminDataError('收入重設失敗', 500);
    }
    return { resetAt: savedResetAt.toISOString() };
  }

  async function deleteAdminAccount(id: string, actor: AdminActor) {
    if (id === actor.id) throw new AdminDataError('不得刪除自己的管理員帳號');
    const [before] = await transport.selectRows<Row>('admin_accounts', `select=*&id=eq.${encodeURIComponent(id)}`);
    if (!before) throw new AdminDataError('Not found', 404);
    await protectLastEnabledSuper(before);
    const [deleted] = await transport.deleteRows<Row>('admin_accounts', `id=eq.${encodeURIComponent(id)}`);
    if (!deleted) throw new AdminDataError('Not found', 404);
    await writeAudit({
      actor,
      operationType: '刪除',
      targetTable: 'admin_accounts',
      targetId: id,
      content: '刪除管理員帳號',
      beforeData: safeAdminAuditRow(before),
    });
  }

  async function deleteActivationCode(id: string, actor: AdminActor) {
    const [activationCode] = await transport.selectRows<Row>(
      'activation_codes',
      `select=id,status,redeemed_at,redeemed_by_member_id&id=eq.${encodeURIComponent(id)}`,
    );
    if (!activationCode) throw new AdminDataError('找不到啟動碼', 404);
    const redeemed = activationCode.status === 'used'
      || Boolean(activationCode.redeemed_at)
      || Boolean(activationCode.redeemed_by_member_id);
    if (redeemed && actor.role !== '超級管理員') {
      throw new AdminDataError('已兌換的啟動碼僅限超級管理員刪除', 403);
    }
    return transport.supabaseRequest<{ deleted: boolean }>('rpc/admin_delete_activation_code', {
      method: 'POST',
      body: JSON.stringify({
        p_code_id: id,
        p_actor_id: actor.id,
        p_actor_name: actor.name || actor.account,
      }),
    });
  }

  async function generateActivationCodeBatch(durationType: string, quantity: number, actor: AdminActor, requestId?: string) {
    if (!durationTypes.includes(durationType)) throw new AdminDataError('啟動期限不正確');
    if (!activationCodeQuantities.includes(quantity)) throw new AdminDataError('建立數量不正確');
    if (!['超級管理員', '營運管理員'].includes(String(actor.role ?? ''))) {
      throw new AdminDataError('沒有建立啟動碼權限', 403);
    }
    if (actor.role === '營運管理員' && !operatorActivationCodeDurations.includes(durationType)) {
      throw new AdminDataError('營運管理員僅可建立 7 天或 15 天啟動碼', 403);
    }
    if (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
      throw new AdminDataError('啟動碼建立請求不正確');
    }
    const result = await transport.supabaseRequest<{ batchId: string; count: number }>('rpc/admin_generate_activation_code_batch', {
      method: 'POST',
      body: JSON.stringify({ p_duration_type: durationType, p_quantity: quantity, p_actor_id: actor.id, p_request_id: requestId }),
    });
    if (!result?.batchId || result.count !== quantity) throw new AdminDataError('啟動碼批次建立失敗', 500);
    return { batchId: result.batchId, count: result.count };
  }

  return {
    writeAudit,
    createAdminAccount,
    updateAdminAccount,
    updateOwnAdminName,
    updateMemberStatus,
    updateSubscription,
    reviewTransferRequest,
    recordPaymentReversal,
    resetRevenue,
    deleteAdminAccount,
    deleteActivationCode,
    generateActivationCodeBatch,
  };
}
