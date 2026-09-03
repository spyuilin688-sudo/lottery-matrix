import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NotificationsPagePatched } from '../NotificationsPagePatched';
import type { MemberNotificationSettings } from '../member-api';

const fetchNotificationSettings = vi.fn();
const saveNotificationSettings = vi.fn();
const hasAuthenticatedMemberSession = vi.fn();

vi.mock('../member-api', async () => {
  const actual = await vi.importActual<typeof import('../member-api')>('../member-api');
  return {
    ...actual,
    fetchNotificationSettings,
    saveNotificationSettings,
    hasAuthenticatedMemberSession,
  };
});

vi.mock('../push-subscription', () => ({
  disablePushNotifications: vi.fn(),
  enablePushNotifications: vi.fn(),
  getPushStatus: vi.fn(),
  PushSubscriptionError: class PushSubscriptionError extends Error {
    status = { supported: true, permission: 'default', enabled: false };
    stage = undefined;
  },
}));

vi.mock('../push-public-key', () => ({ resolveWebPushPublicKey: vi.fn(() => 'key') }));
vi.mock('../BottomNavigation', () => ({ BottomNavigation: () => null }));

const storedSettings: MemberNotificationSettings = {
  settings: {
    bet: true,
    result: true,
    win: true,
    status: true,
    card: true,
    collision: false,
    expiry: true,
    system: true,
  },
  selectedOptions: {
    result: ['今彩539'],
    win: ['彩種通知'],
    status: ['今彩539'],
    card: ['今彩539'],
    expiry: ['提前1日'],
    system: ['維護'],
  },
  betTimes: {
    今彩539: ['', ''],
    天天樂: ['', ''],
    六合彩: ['', ''],
    大樂透: ['', ''],
  },
  statusOptions: {
    今彩539: ['啟動'],
    天天樂: ['啟動'],
    六合彩: ['啟動'],
    大樂透: ['啟動'],
  },
  collisionOptions: {
    今彩539: ['獨碰二星'],
    天天樂: ['獨碰二星'],
    六合彩: ['獨碰二星'],
    大樂透: ['獨碰二星'],
  },
};

describe('notification settings load failure recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasAuthenticatedMemberSession.mockResolvedValue(false);
    saveNotificationSettings.mockResolvedValue(storedSettings);
  });

  test('GET 失敗時鎖定一般通知設定，重新載入成功後才允許編輯與儲存', async () => {
    fetchNotificationSettings
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(storedSettings);

    render(<NotificationsPagePatched onNavigate={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('通知設定載入失敗');
    expect(screen.getByRole('button', { name: '全部開啟' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '全部關閉' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '關閉選號提醒' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /設定選項/ })[0]).toBeDisabled();
    expect(saveNotificationSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '重新載入通知設定' }));

    await waitFor(() => expect(fetchNotificationSettings).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '全部開啟' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '關閉選號提醒' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '關閉選號提醒' }));
    await waitFor(() => expect(saveNotificationSettings).toHaveBeenCalledTimes(1));
  });
});
