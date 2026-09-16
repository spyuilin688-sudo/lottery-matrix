// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render } from '../../test/render-with-dialog';
import { updateAlgorithmCacheSession } from '../auth/algorithm-cache-scope';
import { MatrixExplorePage } from '../features/MatrixExplorePage';

const sdk = vi.hoisted(() => ({ bootstrap: vi.fn(), profile: vi.fn() }));

vi.mock('../member-api', () => ({
  bootstrapMember: sdk.bootstrap,
  fetchMemberProfile: sdk.profile,
}));

vi.mock('../permission-settings', () => ({
  usePermissionSettings: () => ({
    subscriptionPurchaseVisible: false,
    registeredMemberFreeAccess: false,
    revision: 1,
    updatedAt: '2026-09-16T00:00:00.000Z',
  }),
}));

vi.mock('../features/shared', () => ({
  FeatureShell: ({ children }: any) => <main>{children}</main>,
  SectionTitle: ({ children }: any) => <h2>{children}</h2>,
  SettingLabelIcon: () => null,
  MatrixPageSwitcher: () => null,
  LotteryTabs: () => null,
}));

vi.mock('../features/MatrixValidation', () => ({
  ExploreValidationProcess: () => null,
  TianhengValidationProcess: () => null,
  TianyanValidationProcess: () => null,
  RoadValidationProcess: () => null,
}));

const guestProfile = {
  memberId: 'guest-state',
  lineUserId: null,
  planName: null,
  planExpiresAt: null,
  isLifetime: false,
  exploreEntitlements: {
    canUseSeven: false,
    canUseThirteen: false,
    canUseFullRange: false,
  },
};

const fullAccessProfile = {
  memberId: 'member',
  lineUserId: 'line-member',
  planName: '月費方案',
  planExpiresAt: '2026-10-16T00:00:00.000Z',
  isLifetime: false,
  exploreEntitlements: {
    canUseSeven: true,
    canUseThirteen: true,
    canUseFullRange: true,
  },
};

beforeEach(() => {
  updateAlgorithmCacheSession(null);
  sdk.bootstrap.mockReset().mockResolvedValue(undefined);
  sdk.profile.mockReset()
    .mockResolvedValueOnce(guestProfile)
    .mockResolvedValue(fullAccessProfile);
});

afterEach(() => {
  cleanup();
  updateAlgorithmCacheSession(null);
});

test.each([
  ['Matrix 探索', '二期', '進階探索設定'],
  ['Matrix 天衡', '三期', '進階天衡設定'],
] as const)('%s 在會員 session 初始化後重新選取最高可用期數與範圍', async (title, initialPeriod, advancedLabel) => {
  await act(async () => {
    render(<MatrixExplorePage title={title} onNavigate={vi.fn()} />);
  });

  await waitFor(() => expect(sdk.profile).toHaveBeenCalledTimes(1));
  expect(screen.getByText(initialPeriod).closest('button')?.getAttribute('data-selected')).toBe('true');

  const session = {
    user: { id: 'member' },
    access_token: 'member-session',
  };
  await act(async () => {
    updateAlgorithmCacheSession(session as any);
  });

  await waitFor(() => expect(sdk.profile).toHaveBeenCalledTimes(2));
  expect(screen.getByText('十三期').closest('button')?.getAttribute('data-selected')).toBe('true');

  fireEvent.click(screen.getByRole('button', { name: advancedLabel }));
  expect(screen.getByText('完整範圍').closest('button')?.getAttribute('data-selected')).toBe('true');
});

test.each([
  ['Matrix 探索', '進階探索設定'],
  ['Matrix 天衡', '進階天衡設定'],
] as const)('%s 在已登入 session 的首次會員讀取被 session 切換中斷後仍重新讀取最高權限', async (title, advancedLabel) => {
  const session = {
    user: { id: 'member' },
    access_token: 'member-session',
  };
  updateAlgorithmCacheSession(session as any);
  sdk.bootstrap.mockReset()
    .mockRejectedValueOnce(new Error('MEMBER_SESSION_CHANGED'))
    .mockResolvedValue(undefined);
  sdk.profile.mockReset().mockResolvedValue(fullAccessProfile);

  await act(async () => {
    render(<MatrixExplorePage title={title} onNavigate={vi.fn()} />);
  });

  await waitFor(() => expect(sdk.bootstrap).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(sdk.profile).toHaveBeenCalledTimes(1));
  expect(screen.getByText('十三期').closest('button')?.getAttribute('data-selected')).toBe('true');

  fireEvent.click(screen.getByRole('button', { name: advancedLabel }));
  expect(screen.getByText('完整範圍').closest('button')?.getAttribute('data-selected')).toBe('true');
});
