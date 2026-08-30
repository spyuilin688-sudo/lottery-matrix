import { describe, expect, it, vi } from 'vitest';
import {
  canSendTestPush,
  createExclusiveAction,
  createLatestRequestGate,
  formatNotificationError,
  listPushDeliveryLogs,
  listPushMembers,
  sendTestPush,
} from './notification-management';

describe('notification management client', () => {
  it('rejects an empty member selection before calling the API', async () => {
    const post = vi.fn();

    await expect(sendTestPush({ post }, '   ')).rejects.toThrow('請先選擇會員');
    expect(post).not.toHaveBeenCalled();
  });

  it('sends only to the selected member endpoint', async () => {
    const post = vi.fn(async () => ({ data: { sent: 1, failed: 0 } }));

    await expect(sendTestPush({ post }, 'member-1')).resolves.toEqual({ sent: 1, failed: 0 });
    expect(post).toHaveBeenCalledWith('/api/push-members/member-1/test', {});
  });

  it('loads member status and delivery logs from their dedicated endpoints', async () => {
    const members = [{ userId: 'member-1', displayName: '會員一', pictureUrl: null, pushEnabled: true }];
    const logs = [{
      id: 'log-1',
      userId: 'member-1',
      subscriptionId: null,
      title: '樂彩 Matrix 測試通知',
      body: '手機推播已成功啟用',
      status: 'failed' as const,
      failureReason: 'endpoint expired',
      adminAccount: 'admin@example.com',
      sentAt: '2026-08-30T10:00:00.000Z',
    }];
    const get = vi.fn(async (url: string) => ({
      data: url === '/api/push-members' ? { items: members } : { items: logs },
    }));

    await expect(listPushMembers({ get })).resolves.toEqual(members);
    await expect(listPushDeliveryLogs({ get })).resolves.toEqual(logs);
    expect(get).toHaveBeenNthCalledWith(1, '/api/push-members');
    expect(get).toHaveBeenNthCalledWith(2, '/api/push-delivery-logs');
  });

  it.each([
    [400, { error: { code: 'INVALID_MEMBER_ID', message: 'INVALID_MEMBER_ID' } }, '會員資料無效，請重新選擇會員'],
    [409, { error: { code: 'NO_ACTIVE_SUBSCRIPTIONS', message: 'NO_ACTIVE_SUBSCRIPTIONS' } }, '此會員目前沒有有效的推播訂閱'],
    [500, { error: { code: 'PUSH_STARTUP_FAILED_WEB_PUSH_SUBJECT' } }, '推播服務啟動失敗（階段：WEB_PUSH_SUBJECT）'],
    [503, { error: { code: 'UNAVAILABLE', message: 'Supabase is temporarily unavailable' } }, '發送失敗，請稍後再試'],
  ])('maps the production HTTP %i error envelope to fixed Traditional Chinese copy', (_status, cause, expected) => {
    expect(formatNotificationError(cause)).toBe(expected);
  });

  it('understands the existing client response/data wrapper without exposing its message', () => {
    expect(formatNotificationError({
      response: { data: { error: { code: 'INVALID_REQUEST', message: 'private upstream detail' } } },
    })).toBe('會員資料無效，請重新選擇會員');
    expect(formatNotificationError(new Error('private upstream detail'))).toBe('發送失敗，請稍後再試');
  });

  it('does not display a non-allow-listed startup diagnostic stage', () => {
    expect(formatNotificationError({
      response: { data: { error: 'PUSH_STARTUP_FAILED_service-role-secret' } },
    })).toBe('發送失敗，請稍後再試');
  });

  it('understands the AppDeploy adapter string error envelopes', () => {
    expect(formatNotificationError({ response: { data: { error: 'NO_ACTIVE_SUBSCRIPTIONS' } } }))
      .toBe('此會員目前沒有有效的推播訂閱');
    expect(formatNotificationError({ body: { error: 'INVALID_MEMBER_ID' }, statusCode: 400 }))
      .toBe('會員資料無效，請重新選擇會員');
  });
});

describe('notification management state guards', () => {
  it('enables sending only for an editable, selected member with an active subscription', () => {
    const enabled = { userId: 'member-1', displayName: '會員一', pictureUrl: null, pushEnabled: true };
    const disabled = { ...enabled, pushEnabled: false };

    expect(canSendTestPush(null, true, false)).toBe(false);
    expect(canSendTestPush(disabled, true, false)).toBe(false);
    expect(canSendTestPush(enabled, false, false)).toBe(false);
    expect(canSendTestPush(enabled, true, true)).toBe(false);
    expect(canSendTestPush(enabled, true, false)).toBe(true);
  });

  it('allows only the newest mounted request to commit', () => {
    const gate = createLatestRequestGate();
    gate.mount();
    const older = gate.begin();
    const newer = gate.begin();

    expect(gate.canCommit(older)).toBe(false);
    expect(gate.canCommit(newer)).toBe(true);
    gate.dispose();
    expect(gate.canCommit(newer)).toBe(false);
  });

  it('prevents duplicate mutations until the active send settles', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const action = vi.fn(async () => pending);
    const exclusive = createExclusiveAction();

    const first = exclusive.run(action);
    const duplicate = exclusive.run(action);

    expect(action).toHaveBeenCalledTimes(1);
    await expect(duplicate).resolves.toBeUndefined();
    release();
    await first;
    await exclusive.run(action);
    expect(action).toHaveBeenCalledTimes(2);
  });
});
