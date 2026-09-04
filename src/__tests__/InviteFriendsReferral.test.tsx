// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const memberApi = vi.hoisted(() => ({
  fetchMemberReferralSummary: vi.fn(),
  submitMemberReferralCode: vi.fn(),
}));
const activationApi = vi.hoisted(() => ({ redeemActivationCode: vi.fn() }));

vi.mock('../member-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../member-api')>()),
  fetchMemberReferralSummary: memberApi.fetchMemberReferralSummary,
  submitMemberReferralCode: memberApi.submitMemberReferralCode,
}));

vi.mock('../activation/redeemActivationCode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../activation/redeemActivationCode')>()),
  redeemActivationCode: activationApi.redeemActivationCode,
}));

import { FeaturePageRouter } from '../FeaturePagesPatched';
import { AppDialogProvider } from '../dialog/AppDialog';

const summary = {
  referralCode: 'MATRIX-7H4K9P',
  referralSuccessCount: 3,
  hasInvitationCode: false,
  canSubmitReferralCode: true,
};

function renderActivationRoute() {
  return render(
    <AppDialogProvider>
      <FeaturePageRouter screen="activation-code" onNavigate={vi.fn()} />
    </AppDialogProvider>,
  );
}

function PersistentDialogHarness({ active }: { active: boolean }) {
  return (
    <AppDialogProvider>
      {active ? <FeaturePageRouter screen="activation-code" onNavigate={vi.fn()} /> : <p>已離開啟動碼頁</p>}
    </AppDialogProvider>
  );
}

describe('invite friends referral summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memberApi.fetchMemberReferralSummary.mockResolvedValue(summary);
    memberApi.submitMemberReferralCode.mockResolvedValue({
      ...summary,
      hasInvitationCode: true,
      canSubmitReferralCode: false,
    });
    activationApi.redeemActivationCode.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('邀請好友與我的推薦碼使用同一會員資料，並可複製推薦碼', async () => {
    render(<FeaturePageRouter screen="invite-friends" onNavigate={vi.fn()} />);

    expect(await screen.findByText('MATRIX-7H4K9P')).toBeVisible();
    expect(screen.getByText('推薦成功 3 人')).toBeVisible();
    expect(memberApi.fetchMemberReferralSummary).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '複製推薦碼' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('MATRIX-7H4K9P'));
  });

  test('我的推薦碼頁移除邀請好友按鈕並在複製完成後短暫顯示成功狀態', async () => {
    let resolveCopy!: () => void;
    vi.mocked(navigator.clipboard.writeText)
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveCopy = resolve; }))
      .mockResolvedValueOnce(undefined);
    renderActivationRoute();

    expect(await screen.findByText('MATRIX-7H4K9P')).toBeVisible();
    expect(screen.queryByRole('button', { name: '邀請好友' })).not.toBeInTheDocument();
    const feedback = screen.getByRole('status');
    expect(feedback.textContent).toBe('');
    expect(feedback).toHaveAttribute('aria-live', 'polite');
    expect(feedback).toHaveAttribute('aria-atomic', 'true');
    expect(feedback).toHaveAttribute('data-visible', 'false');

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '複製推薦碼' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('MATRIX-7H4K9P');
    expect(screen.queryByText('複製成功')).not.toBeInTheDocument();

    await act(async () => { resolveCopy(); });
    expect(screen.getByRole('status')).toBe(feedback);
    expect(feedback).toHaveTextContent('複製成功');
    expect(feedback).toHaveAttribute('data-visible', 'true');
    expect(feedback.querySelector('[data-feedback-icon="check"]')).toHaveAttribute('aria-hidden', 'true');

    act(() => { vi.advanceTimersByTime(1000); });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '複製推薦碼' }));
      await Promise.resolve();
    });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText('複製成功')).toBeVisible();
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByRole('status')).toBe(feedback);
    expect(feedback.textContent).toBe('');
    expect(feedback).toHaveAttribute('data-visible', 'false');
  });

  test('複製推薦碼失敗時顯示危險提示對話框', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('permission denied'));
    renderActivationRoute();

    expect(await screen.findByText('MATRIX-7H4K9P')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '複製推薦碼' }));

    const dialog = await screen.findByRole('dialog', { name: '複製失敗' });
    expect(dialog).toHaveTextContent('請稍後再試。');
    expect(dialog).toHaveAttribute('data-tone', 'danger');
    expect(screen.queryByText('複製成功')).not.toBeInTheDocument();
  });

  test('複製仍在等待時離開頁面，不會在完成後建立成功提示計時器', async () => {
    let resolveCopy!: () => void;
    vi.mocked(navigator.clipboard.writeText)
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveCopy = resolve; }));
    const view = renderActivationRoute();

    expect(await screen.findByText('MATRIX-7H4K9P')).toBeVisible();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '複製推薦碼' }));
    expect(vi.getTimerCount()).toBe(0);

    view.unmount();
    await act(async () => { resolveCopy(); });

    expect(vi.getTimerCount()).toBe(0);
    expect(screen.queryByText('複製成功')).not.toBeInTheDocument();
  });

  test('較舊的複製失敗晚於較新的成功完成時，不會清除成功或開啟失敗提示', async () => {
    let rejectOlder!: (reason: Error) => void;
    vi.mocked(navigator.clipboard.writeText)
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectOlder = reject; }))
      .mockResolvedValueOnce(undefined);
    renderActivationRoute();

    expect(await screen.findByText('MATRIX-7H4K9P')).toBeVisible();
    vi.useFakeTimers();
    const copyButton = screen.getByRole('button', { name: '複製推薦碼' });
    fireEvent.click(copyButton);
    await act(async () => {
      fireEvent.click(copyButton);
      await Promise.resolve();
    });
    expect(screen.getByText('複製成功')).toBeVisible();

    await act(async () => {
      rejectOlder(new Error('older permission failure'));
      await Promise.resolve();
    });

    expect(screen.getByText('複製成功')).toBeVisible();
    expect(screen.queryByRole('dialog', { name: '複製失敗' })).not.toBeInTheDocument();
  });

  test('較舊的複製成功晚於較新的失敗完成時，不會顯示過時成功', async () => {
    let resolveOlder!: () => void;
    vi.mocked(navigator.clipboard.writeText)
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveOlder = resolve; }))
      .mockRejectedValueOnce(new Error('newer permission failure'));
    renderActivationRoute();

    expect(await screen.findByText('MATRIX-7H4K9P')).toBeVisible();
    const copyButton = screen.getByRole('button', { name: '複製推薦碼' });
    fireEvent.click(copyButton);
    await act(async () => {
      fireEvent.click(copyButton);
      await Promise.resolve();
    });
    expect(screen.getByRole('dialog', { name: '複製失敗' })).toBeVisible();

    await act(async () => { resolveOlder(); });

    expect(screen.queryByText('複製成功')).not.toBeInTheDocument();
  });

  test('推薦碼送出須先確認，取消不送出而確認才呼叫既有流程', async () => {
    renderActivationRoute();

    const input = await screen.findByRole('textbox', { name: '推薦碼' });
    fireEvent.change(input, { target: { value: 'FRIEND-8A2K' } });
    fireEvent.click(screen.getByRole('button', { name: '確認' }));

    expect(memberApi.submitMemberReferralCode).not.toHaveBeenCalled();
    let dialog = screen.getByRole('dialog', { name: '確認輸入推薦碼？' });
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(memberApi.submitMemberReferralCode).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '確認輸入推薦碼？' })).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '確認' }));
    dialog = await screen.findByRole('dialog', { name: '確認輸入推薦碼？' });
    fireEvent.click(within(dialog).getByRole('button', { name: '確認' }));

    await waitFor(() => expect(memberApi.submitMemberReferralCode).toHaveBeenCalledWith('FRIEND-8A2K'));
  });

  test('啟動碼兌換須先確認，取消不兌換而確認才呼叫既有流程', async () => {
    renderActivationRoute();

    await screen.findByText('MATRIX-7H4K9P');
    fireEvent.click(screen.getByRole('button', { name: '啟動碼' }));
    fireEvent.change(screen.getByRole('textbox', { name: '啟動碼' }), {
      target: { value: 'A7K9-P2XM-4Q8R-N6TY' },
    });
    const panel = document.getElementById('activation-code-panel')!;
    fireEvent.click(within(panel).getByRole('button', { name: '確認' }));

    expect(activationApi.redeemActivationCode).not.toHaveBeenCalled();
    let dialog = screen.getByRole('dialog', { name: '確認使用啟動碼？' });
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(activationApi.redeemActivationCode).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '確認使用啟動碼？' })).not.toBeInTheDocument());

    fireEvent.click(within(panel).getByRole('button', { name: '確認' }));
    dialog = await screen.findByRole('dialog', { name: '確認使用啟動碼？' });
    fireEvent.click(within(dialog).getByRole('button', { name: '確認' }));

    await waitFor(() => expect(activationApi.redeemActivationCode).toHaveBeenCalledWith('A7K9-P2XM-4Q8R-N6TY'));
  });

  test('推薦碼確認對話框開啟後離開頁面，即使確認也不送出', async () => {
    const view = render(<PersistentDialogHarness active />);

    const input = await screen.findByRole('textbox', { name: '推薦碼' });
    fireEvent.change(input, { target: { value: 'FRIEND-8A2K' } });
    fireEvent.click(screen.getByRole('button', { name: '確認' }));
    const dialog = screen.getByRole('dialog', { name: '確認輸入推薦碼？' });

    view.rerender(<PersistentDialogHarness active={false} />);
    expect(screen.getByText('已離開啟動碼頁')).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: '確認' }));
    await act(async () => { await Promise.resolve(); });

    expect(memberApi.submitMemberReferralCode).not.toHaveBeenCalled();
  });

  test('啟動碼確認對話框開啟後離開頁面，即使確認也不兌換', async () => {
    const view = render(<PersistentDialogHarness active />);

    await screen.findByText('MATRIX-7H4K9P');
    fireEvent.click(screen.getByRole('button', { name: '啟動碼' }));
    fireEvent.change(screen.getByRole('textbox', { name: '啟動碼' }), {
      target: { value: 'A7K9-P2XM-4Q8R-N6TY' },
    });
    fireEvent.click(within(document.getElementById('activation-code-panel')!).getByRole('button', { name: '確認' }));
    const dialog = screen.getByRole('dialog', { name: '確認使用啟動碼？' });

    view.rerender(<PersistentDialogHarness active={false} />);
    expect(screen.getByText('已離開啟動碼頁')).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: '確認' }));
    await act(async () => { await Promise.resolve(); });

    expect(activationApi.redeemActivationCode).not.toHaveBeenCalled();
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
});
