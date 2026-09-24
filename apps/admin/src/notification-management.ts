export const TEST_PUSH_TITLE = '樂彩 Matrix 測試通知';
export const TEST_PUSH_BODY = '手機推播已成功啟用';

export type PushMember = {
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

export type TestPushResult = { sent: number; failed: number };

export type NotificationApiClient = {
  get(url: string): Promise<{ data: unknown }>;
  post(url: string, body?: unknown): Promise<{ data: unknown }>;
};

function itemsFrom<T>(data: unknown): T[] {
  if (!data || typeof data !== 'object') return [];
  const items = (data as { items?: unknown }).items;
  return Array.isArray(items) ? items as T[] : [];
}

export type PushMemberPage = { items: PushMember[]; total: number; currentPage: number; totalPages: number };
export async function listPushMembers(
  client: Pick<NotificationApiClient, 'get'>,
  query: { page?: number; keyword?: string; userId?: string } = {},
): Promise<PushMemberPage> {
  const params = new URLSearchParams();
  if (query.page && (query.page !== 1 || query.keyword)) params.set('page', String(query.page));
  if (query.keyword) params.set('keyword', query.keyword);
  if (query.userId) params.set('userId', query.userId);
  const response = await client.get(`/api/push-members${params.size ? `?${params}` : ''}`);
  const items = itemsFrom<PushMember>(response.data);
  const data = response.data as Partial<PushMemberPage>;
  return { items, total: data.total ?? items.length, currentPage: data.currentPage ?? 1, totalPages: data.totalPages ?? 1 };
}

export async function listPushDeliveryLogs(client: Pick<NotificationApiClient, 'get'>) {
  const response = await client.get('/api/push-delivery-logs');
  return itemsFrom<PushDeliveryLog>(response.data);
}

export async function sendTestPush(
  client: Pick<NotificationApiClient, 'post'>,
  memberId: string,
  requestId: string,
): Promise<TestPushResult> {
  const selectedMember = memberId.trim();
  if (!selectedMember) throw new Error('請先選擇會員');
  const response = await client.post(`/api/push-members/${encodeURIComponent(selectedMember)}/test`, { requestId });
  return response.data as TestPushResult;
}

export function canSendTestPush(
  member: PushMember | null,
  canEdit: boolean,
  sending: boolean,
) {
  return Boolean(member?.pushEnabled && canEdit && !sending);
}

function recordFrom(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function notificationErrorCode(cause: unknown) {
  const root = recordFrom(cause);
  const response = recordFrom(root?.response);
  const responseData = recordFrom(response?.data);
  const data = recordFrom(root?.data);
  const body = recordFrom(root?.body);
  const stringErrors = [responseData?.error, data?.error, body?.error, root?.error];
  for (const error of stringErrors) {
    if (typeof error === 'string') return error;
  }
  const candidates = [
    recordFrom(responseData?.error),
    recordFrom(data?.error),
    recordFrom(root?.error),
    responseData,
    data,
    body,
    root,
  ];
  for (const candidate of candidates) {
    if (typeof candidate?.code === 'string') return candidate.code;
    if (typeof candidate?.message === 'string') return candidate.message;
  }
  return '';
}

export function isNoActiveSubscriptionsError(cause: unknown) {
  return notificationErrorCode(cause) === 'NO_ACTIVE_SUBSCRIPTIONS';
}

export function isDefinitiveTestPushError(cause: unknown) {
  return ['NO_ACTIVE_SUBSCRIPTIONS', 'SUBSCRIPTION_LOOKUP_FAILED', 'INVALID_REQUEST']
    .includes(notificationErrorCode(cause));
}

export function testPushRequestId(adminId: string, memberId: string) {
  const key = `admin-test-push:${adminId}:${memberId}`;
  try {
    const pending = sessionStorage.getItem(key);
    if (pending) return pending;
  } catch { /* The in-memory fallback is managed by the component. */ }
  const requestId = crypto.randomUUID();
  try { sessionStorage.setItem(key, requestId); } catch { /* Storage can be disabled. */ }
  return requestId;
}

export function clearTestPushRequestId(adminId: string, memberId: string) {
  try { sessionStorage.removeItem(`admin-test-push:${adminId}:${memberId}`); } catch { /* Storage can be disabled. */ }
}

export function formatNotificationError(cause: unknown) {
  const code = notificationErrorCode(cause);
  if (code === 'NO_ACTIVE_SUBSCRIPTIONS') return '此會員目前沒有有效的推播訂閱';
  if (code === 'TEST_PUSH_IN_PROGRESS') return '上次發送仍在處理；稍後重按會查詢同一筆結果，不會再次發送';
  if (code === 'TEST_PUSH_STATUS_UNKNOWN' || code === 'TEST_PUSH_CLAIM_FAILED') return '發送狀態未確認；稍後重按會查詢同一筆結果';
  if (code === 'INVALID_MEMBER_ID' || code === 'MEMBER_REQUIRED' || code === 'INVALID_REQUEST') {
    return '會員資料無效，請重新選擇會員';
  }
  return '發送失敗，請稍後再試';
}

export function createLatestRequestGate() {
  let mounted = false;
  let revision = 0;
  return {
    mount() {
      mounted = true;
      revision += 1;
    },
    begin() {
      revision += 1;
      return revision;
    },
    canCommit(requestRevision: number) {
      return mounted && requestRevision === revision;
    },
    dispose() {
      mounted = false;
      revision += 1;
    },
  };
}

export function createExclusiveAction() {
  let running = false;
  return {
    async run<T>(action: () => Promise<T>): Promise<T | undefined> {
      if (running) return undefined;
      running = true;
      try {
        return await action();
      } finally {
        running = false;
      }
    },
  };
}
