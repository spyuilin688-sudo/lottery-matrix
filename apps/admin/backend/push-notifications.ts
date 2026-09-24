import {
  createSupabaseTransport,
  type SupabaseConfig,
} from './supabase';
import { memberDisplayNameFromAuthUser, providerIdentityFromAuthUser } from './member-provider-identity';

type ConfigSource = SupabaseConfig | (() => Promise<SupabaseConfig>);
type Row = Record<string, unknown>;

type AuthIdentity = {
  provider?: unknown;
  provider_id?: unknown;
  identity_data?: Record<string, unknown> | null;
};

type AuthUser = {
  id?: unknown;
  user_metadata?: Record<string, unknown> | null;
  identities?: AuthIdentity[] | null;
  push_enabled?: boolean;
};

export type PushMemberQuery = { page?: unknown; keyword?: unknown; userId?: unknown };
export type PushMemberPage = { items: MemberPushStatus[]; total: number; currentPage: number; totalPages: number };

type EdgeBusinessErrorCode = 'INVALID_REQUEST' | 'NO_ACTIVE_SUBSCRIPTIONS' | 'TEST_PUSH_IN_PROGRESS'
  | 'SUBSCRIPTION_LOOKUP_FAILED' | 'TEST_PUSH_STATUS_UNKNOWN' | 'TEST_PUSH_CLAIM_FAILED';
type EdgeBusinessEnvelope = {
  edgeBusinessError: {
    code: EdgeBusinessErrorCode;
    statusCode: 400 | 409 | 500 | 503;
  };
};

export type MemberPushStatus = {
  userId: string;
  identityLabel: 'LINE ID' | 'Google ID' | null;
  identityValue: string | null;
  identityDisplay: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  pushEnabled: boolean;
};

export type PushDeliveryLog = {
  id: string;
  displayName?: string | null;
  userId: string;
  subscriptionId: string | null;
  title: string;
  body: string;
  status: 'sent' | 'failed';
  failureReason: string | null;
  adminAccount: string;
  sentAt: string;
};

export class PushNotificationsError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, statusCode = 400) {
    super(code);
    this.name = 'PushNotificationsError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const PAGE_SIZE = 30;
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function lineIdentity(user: AuthUser | undefined) {
  return user?.identities?.find((identity) => identity.provider === 'custom:line')?.identity_data ?? null;
}

export function requireMemberUuid(value: unknown) {
  const member = optionalString(value);
  if (!member) throw new PushNotificationsError('MEMBER_REQUIRED');
  if (!UUID_PATTERN.test(member)) throw new PushNotificationsError('INVALID_MEMBER_ID');
  return member;
}

async function edgeBusinessEnvelope(response: Response): Promise<EdgeBusinessEnvelope | null> {
  if (![400, 409, 500, 503].includes(response.status)) return null;
  let body: Row;
  try {
    body = await response.clone().json() as Row;
  } catch {
    return null;
  }
  const error = body.error && typeof body.error === 'object' ? body.error as Row : null;
  const code = optionalString(error?.code);
  if (response.status === 400 && code === 'INVALID_REQUEST') {
    return { edgeBusinessError: { code, statusCode: 400 } };
  }
  if (response.status === 409 && (code === 'NO_ACTIVE_SUBSCRIPTIONS' || code === 'TEST_PUSH_IN_PROGRESS')) {
    return { edgeBusinessError: { code, statusCode: 409 } };
  }
  if (response.status === 500 && code === 'SUBSCRIPTION_LOOKUP_FAILED') {
    return { edgeBusinessError: { code, statusCode: 500 } };
  }
  if (response.status === 503 && (code === 'TEST_PUSH_STATUS_UNKNOWN' || code === 'TEST_PUSH_CLAIM_FAILED')) {
    return { edgeBusinessError: { code, statusCode: 503 } };
  }
  return null;
}

export function createPushNotifications(
  configOrLoader: ConfigSource,
  fetcher: typeof fetch = fetch,
) {
  const transportFetcher: typeof fetch = async (input, init) => {
    const response = await fetcher(input, init);
    if (String(input).endsWith('/functions/v1/send-test-push')) {
      const envelope = await edgeBusinessEnvelope(response);
      if (envelope) return new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return response;
  };
  const supabase = createSupabaseTransport(configOrLoader, transportFetcher);

  function enrichMember(row: Row, authUser: AuthUser): MemberPushStatus {
    const userId = String(row.auth_user_id ?? '');
    const identity = lineIdentity(authUser);
    const providerIdentity = providerIdentityFromAuthUser(row.line_user_id, authUser);
    return {
      userId,
      identityLabel: providerIdentity?.label ?? null,
      identityValue: providerIdentity?.value ?? null,
      identityDisplay: providerIdentity ? `${providerIdentity.label}：${providerIdentity.value}` : null,
      displayName: memberDisplayNameFromAuthUser(row.line_display_name, authUser),
      pictureUrl: optionalString(authUser?.user_metadata?.picture) ?? optionalString(identity?.picture),
      pushEnabled: authUser.push_enabled === true,
    };
  }

  async function enrichPage(rows: Row[]): Promise<MemberPushStatus[]> {
    if (!rows.length) return [];
    const userIds = [...new Set(rows.map(row => String(row.auth_user_id ?? '')))];
    const details = await supabase.request<AuthUser[]>('/rest/v1/rpc/admin_push_member_details', {
      method: 'POST', body: JSON.stringify({ p_auth_user_ids: userIds }),
    });
    const byId = new Map(details.map(user => [String(user.id ?? ''), user]));
    return rows.map(row => {
      const user = byId.get(String(row.auth_user_id ?? ''));
      if (!user || typeof user.push_enabled !== 'boolean') throw new PushNotificationsError('UNAVAILABLE', 503);
      return enrichMember(row, user);
    });
  }

  return {
    async listMemberPushStatus(query: PushMemberQuery = {}): Promise<PushMemberPage> {
      const page = Number(query.page ?? 1);
      const keyword = String(query.keyword ?? '').trim();
      const offset = (page - 1) * PAGE_SIZE;
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(offset + PAGE_SIZE - 1) || keyword.length > 200) {
        throw new PushNotificationsError('INVALID_REQUEST');
      }
      if (keyword && query.userId === undefined) {
        const result = await supabase.request<{ items: Row[]; total: number; currentPage: number; totalPages: number }>(
          '/rest/v1/rpc/admin_push_member_page', {
            method: 'POST', body: JSON.stringify({ p_keyword: keyword, p_page: page }),
          },
        );
        const items = await enrichPage(result.items);
        return { ...result, items };
      }
      const url = new URL('/rest/v1/members?select=auth_user_id%2Cline_user_id%2Cline_display_name&order=auth_user_id.asc', 'https://supabase.invalid');
      if (query.userId !== undefined) url.searchParams.set('auth_user_id', `eq.${requireMemberUuid(query.userId)}`);
      const read = async (currentPage: number) => {
        const start = (currentPage - 1) * PAGE_SIZE;
        const items: Row[] = [];
        let total = 0;
        do {
          url.searchParams.set('limit', String(PAGE_SIZE - items.length));
          url.searchParams.set('offset', String(start + items.length));
          const result = await supabase.requestPage<Row>(url.pathname + url.search);
          total = result.total;
          if (!result.items.length) break;
          items.push(...result.items);
        } while (items.length < PAGE_SIZE && start + items.length < total);
        return { items, total };
      };
      let result = await read(page);
      const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
      const currentPage = Math.min(page, totalPages);
      if (currentPage !== page) result = await read(currentPage);
      const items = await enrichPage(result.items);
      return { items, total: result.total, currentPage, totalPages: Math.max(1, Math.ceil(result.total / PAGE_SIZE)) };
    },

    async sendMemberTestPush(
      userId: string,
      adminAccount: string,
      requestId: string,
      adminId: string,
    ): Promise<{ sent: number; failed: number }> {
      const member = requireMemberUuid(userId);
      if (!UUID_PATTERN.test(requestId) || !UUID_PATTERN.test(adminId)) {
        throw new PushNotificationsError('INVALID_REQUEST');
      }
      const result = await supabase.request<
        { sent: number; failed: number } | EdgeBusinessEnvelope
      >('/functions/v1/send-test-push', {
        method: 'POST',
        body: JSON.stringify({ userId: member, adminAccount: adminAccount.trim(), requestId, adminId }),
      });
      if ('edgeBusinessError' in result) {
        throw new PushNotificationsError(
          result.edgeBusinessError.code,
          result.edgeBusinessError.statusCode,
        );
      }
      return result;
    },

    async listPushDeliveryLogs(): Promise<PushDeliveryLog[]> {
      const rows = await supabase.request<Row[]>(
        '/rest/v1/push_delivery_logs?select=id%2Cuser_id%2Csubscription_id%2Ctitle%2Cbody%2Cstatus%2Cfailure_reason%2Cadmin_account%2Csent_at&order=sent_at.desc&limit=200',
      );
      const userIds = [...new Set(rows.map(row => String(row.user_id ?? '')).filter(id => UUID_PATTERN.test(id)))];
      const names = userIds.length ? await supabase.request<Row[]>('/rest/v1/rpc/admin_push_log_member_names', {
        method: 'POST', body: JSON.stringify({ p_auth_user_ids: userIds }),
      }) : [];
      const namesById = new Map(names.map(row => [String(row.user_id), optionalString(row.display_name)]));
      return rows.map((row) => ({
        displayName: namesById.get(String(row.user_id)) ?? null,
        id: String(row.id ?? ''),
        userId: String(row.user_id ?? ''),
        subscriptionId: optionalString(row.subscription_id),
        title: String(row.title ?? ''),
        body: String(row.body ?? ''),
        status: row.status === 'sent' ? 'sent' : 'failed',
        failureReason: optionalString(row.failure_reason),
        adminAccount: String(row.admin_account ?? ''),
        sentAt: String(row.sent_at ?? ''),
      }));
    },
  };
}
