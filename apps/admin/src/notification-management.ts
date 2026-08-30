export const TEST_PUSH_TITLE = '樂彩 Matrix 測試通知';
export const TEST_PUSH_BODY = '手機推播已成功啟用';

export type PushMember = {
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

export async function listPushMembers(client: Pick<NotificationApiClient, 'get'>) {
  const response = await client.get('/api/push-members');
  return itemsFrom<PushMember>(response.data);
}

export async function listPushDeliveryLogs(client: Pick<NotificationApiClient, 'get'>) {
  const response = await client.get('/api/push-delivery-logs');
  return itemsFrom<PushDeliveryLog>(response.data);
}

export async function sendTestPush(
  client: Pick<NotificationApiClient, 'post'>,
  memberId: string,
): Promise<TestPushResult> {
  const selectedMember = memberId.trim();
  if (!selectedMember) throw new Error('請先選擇會員');
  const response = await client.post(`/api/push-members/${encodeURIComponent(selectedMember)}/test`, {});
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

export function formatNotificationError(cause: unknown) {
  const code = notificationErrorCode(cause);
  if (code === 'NO_ACTIVE_SUBSCRIPTIONS') return '此會員目前沒有有效的推播訂閱';
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
