import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NotificationsPagePatched } from '../NotificationsPagePatched';
import type { MemberNotificationSettings } from '../member-api';

const memberApi = vi.hoisted(() => ({
  fetchNotificationSettings: vi.fn(),
  saveNotificationSettings: vi.fn(),
  hasAuthenticatedMemberSession: vi.fn(),
}));

vi.mock('../member-api', async () => {
  const actual = await vi.importActual<typeof import('../member-api')>('../member-api');
  return {
    ...actual,
    fetchNotificationSettings: memberApi.fetchNotificationSettings,
    saveNotificationSettings: memberApi.saveNotificationSettings,
    hasAuthenticatedMemberSession: memberApi.hasAuthenticatedMemberSession,
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

const lotteryNames = ['今彩539', '天天樂', '\u516d\u5408\u5f69', '大樂透'] as const;
const emptyTimes = Object.fromEntries(lotteryNames.map((lottery) => [lottery, ['', '']])) as MemberNotificationSettings['betTimes'];
const activeStatuses = Object.fromEntries(lotteryNames.map((lottery) => [lottery, ['啟動']])) as MemberNotificationSettings['statusOptions'];
const collisionOptions = Object.fromEntries(lotteryNames.map((lottery) => [lottery, ['獨碰二星']])) as MemberNotificationSettings['collisionOptions'];

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
  betTimes: emptyTimes,
  statusOptions: activeStatuses,
  collisionOptions,
};

describe('notification settings load failure recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memberApi.hasAuthenticatedMemberSession.mockResolvedValue(false);
    memberApi.saveNotificationSettings.mockResolvedValue(storedSettings);
  });

  test('GET 失敗時鎖定一般通知設定，重新載入成功後才允許編輯與儲存', async () => {
    memberApi.fetchNotificationSettings
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(storedSettings);

    render(<NotificationsPagePatched onNavigate={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('通知設定載入失敗');
    expect(screen.getByRole('button', { name: '全部開啟' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '全部關閉' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '關閉選號提醒' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /設定選項/ })[0]).toBeDisabled();
    expect(memberApi.saveNotificationSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '重新載入通知設定' }));

    await waitFor(() => expect(memberApi.fetchNotificationSettings).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '全部開啟' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '關閉選號提醒' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '關閉選號提醒' }));
    await waitFor(() => expect(memberApi.saveNotificationSettings).toHaveBeenCalledTimes(1));
  });
});
