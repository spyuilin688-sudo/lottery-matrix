import {
  createSupabaseTransport,
  type SupabaseConfig,
} from './supabase';

type ConfigSource = SupabaseConfig | (() => Promise<SupabaseConfig>);
type Row = Record<string, unknown>;

type AuthIdentity = {
  provider?: unknown;
  identity_data?: Record<string, unknown> | null;
};

type AuthUser = {
  id?: unknown;
  user_metadata?: Record<string, unknown> | null;
  identities?: AuthIdentity[] | null;
};

type AuthUsersResponse = {
  users?: AuthUser[];
};

type EdgeBusinessErrorCode = 'INVALID_REQUEST' | 'NO_ACTIVE_SUBSCRIPTIONS';
type EdgeBusinessEnvelope = {
  edgeBusinessError: {
    code: EdgeBusinessErrorCode;
    statusCode: 400 | 409;
  };
};

export type MemberPushStatus = {
  userId: string;
  displayName: string | null;
  pictureUrl: string | null;
  pushEnabled: boolean;
};

export type PushDeliveryLog = {
  id: string;
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

const PAGE_SIZE = 1000;
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
  if (response.status !== 400 && response.status !== 409) return null;
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
  if (response.status === 409 && code === 'NO_ACTIVE_SUBSCRIPTIONS') {
    return { edgeBusinessError: { code, statusCode: 409 } };
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

  async function listAllRows(path: string) {
    const result: Row[] = [];
    for (;;) {
      const start = result.length;
      const page = await supabase.request<{ items: Row[]; total: number }>(path, {
        headers: {
          Range: `${start}-${start + PAGE_SIZE - 1}`,
          'Range-Unit': 'items',
          Prefer: 'count=exact',
        },
      }, true);
      result.push(...page.items);
      // PostgREST may cap a range below PAGE_SIZE. Advance by actual rows and
      // use its exact count (or an empty response) to detect the final page.
      if (page.items.length === 0 || result.length >= page.total) return result;
    }
  }

  async function listAllAuthUsers() {
    const result: AuthUser[] = [];
    for (let page = 1; ; page += 1) {
      const response = await supabase.request<AuthUsersResponse>(
        `/auth/v1/admin/users?page=${page}&per_page=${PAGE_SIZE}`,
      );
      const users = response.users ?? [];
      result.push(...users);
      if (users.length < PAGE_SIZE) return result;
    }
  }

  return {
    async listMemberPushStatus(): Promise<MemberPushStatus[]> {
      const [members, authUsers, subscriptions] = await Promise.all([
        listAllRows('/rest/v1/members?select=auth_user_id%2Cline_display_name&order=auth_user_id.asc'),
        listAllAuthUsers(),
        listAllRows('/rest/v1/member_push_subscriptions?select=id%2Cuser_id&enabled=eq.true&order=id.asc'),
      ]);
      const users = new Map(
        authUsers.map((user) => [String(user.id ?? ''), user]),
      );
      const enabledUsers = new Set(subscriptions.map((row) => String(row.user_id ?? '')));

      return members.map((row) => {
        const userId = String(row.auth_user_id ?? '');
        const authUser = users.get(userId);
        const identity = lineIdentity(authUser);
        return {
          userId,
          displayName: optionalString(authUser?.user_metadata?.name)
            ?? optionalString(identity?.name)
            ?? optionalString(row.line_display_name),
          pictureUrl: optionalString(authUser?.user_metadata?.picture)
            ?? optionalString(identity?.picture),
          pushEnabled: enabledUsers.has(userId),
        };
      });
    },

    async sendMemberTestPush(
      userId: string,
      adminAccount: string,
    ): Promise<{ sent: number; failed: number }> {
      const member = requireMemberUuid(userId);
      const result = await supabase.request<
        { sent: number; failed: number } | EdgeBusinessEnvelope
      >('/functions/v1/send-test-push', {
        method: 'POST',
        body: JSON.stringify({ userId: member, adminAccount: adminAccount.trim() }),
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
      return rows.map((row) => ({
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
