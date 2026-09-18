// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const memberApi = vi.hoisted(() => ({
  fetchMemberReferralSummary: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ auth: {
  getSession: async () => ({ data: { session: { access_token: 'member-session' } }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
} }) }));

vi.mock('../member-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../member-api')>()),
  fetchMemberReferralSummary: memberApi.fetchMemberReferralSummary,
}));

import { FeaturePageRouter } from '../FeaturePagesPatched';
import { AppDialogProvider } from '../dialog/AppDialog';
import { updateAlgorithmCacheSession } from '../auth/algorithm-cache-scope';

const summary = {
  referralCode: 'MATRIX-7H4K9P',
  referralSuccessCount: 3,
  hasInvitationCode: false,
  canSubmitReferralCode: true,
};

describe('invite friends referral summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateAlgorithmCacheSession({ access_token: 'member-a', user: { id: 'member-a' } } as never);
    memberApi.fetchMemberReferralSummary.mockResolvedValue(summary);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  test('邀請好友與我的推薦碼使用同一會員資料，並可複製推薦碼', async () => {
    render(<FeaturePageRouter screen="invite-friends" onNavigate={vi.fn()} />);

    expect(await screen.findByText('MATRIX-7H4K9P')).toBeVisible();
    expect(screen.getByText('推薦成功 3 人')).toBeVisible();
    expect(memberApi.fetchMemberReferralSummary).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '複製推薦碼' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('MATRIX-7H4K9P'));
  });

  test('我的推薦碼頁移除邀請好友按鈕並保留行內複製功能', async () => {
    render(<AppDialogProvider><FeaturePageRouter screen="activation-code" onNavigate={vi.fn()} /></AppDialogProvider>);

    expect(await screen.findByText('MATRIX-7H4K9P')).toBeVisible();
    expect(screen.queryByRole('button', { name: '邀請好友' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '複製推薦碼' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('MATRIX-7H4K9P'));
  });

  test('載入失敗顯示可恢復錯誤，重新載入成功後顯示會員推薦碼', async () => {
    memberApi.fetchMemberReferralSummary
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(summary);

    render(<FeaturePageRouter screen="invite-friends" onNavigate={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('推薦資料載入失敗');
    fireEvent.click(screen.getByRole('button', { name: '重新載入推薦資料' }));

    expect(await screen.findByText('MATRIX-7H4K9P')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('account changes replace referral data and ignore an old member response', async () => {
    let finishOld!: (value: unknown) => void;
    memberApi.fetchMemberReferralSummary.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValue({ ...summary, referralCode: 'NEW-MEMBER' });
    render(<FeaturePageRouter screen="invite-friends" onNavigate={vi.fn()} />);
    act(() => updateAlgorithmCacheSession({ access_token: 'member-b', user: { id: 'member-b' } } as never));
    await screen.findByText('NEW-MEMBER');
    await act(async () => finishOld({ ...summary, referralCode: 'OLD-MEMBER' }));
    expect(screen.queryByText('OLD-MEMBER')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '複製推薦碼' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('NEW-MEMBER'));
  });
});
