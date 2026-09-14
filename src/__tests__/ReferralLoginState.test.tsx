// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  receive: null as null | ((event: string, session: unknown) => void),
}));
const referral = vi.hoisted(() => ({ fetchSummary: vi.fn() }));
const activation = vi.hoisted(() => ({ redeem: vi.fn() }));
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ auth }) }));
vi.mock('../member-api', async (original) => ({
  ...await original<typeof import('../member-api')>(),
  fetchMemberReferralSummary: referral.fetchSummary,
}));
vi.mock('../activation/redeemActivationCode', async (original) => ({
  ...await original<typeof import('../activation/redeemActivationCode')>(),
  redeemActivationCode: activation.redeem,
}));
import { ActivationCodePage } from '../features/MemberPages';
import { AppDialogProvider } from '../dialog/AppDialog';

const session = { user: { id: 'member-1' }, access_token: 'test-session' };
const summary = { referralCode: 'MATRIX-7H4K9P', referralSuccessCount: 3,
  hasInvitationCode: false, canSubmitReferralCode: true };
const showPage = () => render(<AppDialogProvider><ActivationCodePage onNavigate={vi.fn()} /></AppDialogProvider>);
const nextSession = { user: { id: 'member-2' }, access_token: 'next-session' };
const code = 'A7K9-P2XM-4Q8R-N6TY';

async function openActivationConfirmation() {
  fireEvent.click(screen.getByRole('button', { name: '啟動碼' }));
  fireEvent.change(screen.getByRole('textbox', { name: '啟動碼' }), { target: { value: code } });
  fireEvent.click(within(document.getElementById('activation-code-panel')!).getByRole('button', { name: '確認' }));
  return screen.findByRole('dialog');
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  auth.onAuthStateChange.mockImplementation((receive) => {
    auth.receive = receive;
    return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
  });
  referral.fetchSummary.mockResolvedValue(summary);
  activation.redeem.mockReset();
  activation.redeem.mockResolvedValue({});
});

describe('referral page login state', () => {
  it('tells signed-out visitors to log in without requesting member data', async () => {
    showPage();
    expect(await screen.findByText('請先以 LINE 登入')).toBeVisible();
    expect(screen.queryByText('推薦碼資訊暫時無法讀取，請稍後再試')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '推薦碼' })).toBeDisabled();
    expect(referral.fetchSummary).not.toHaveBeenCalled();
  });

  it('loads referral data after login while the page remains open', async () => {
    showPage();
    await screen.findByText('請先以 LINE 登入');
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    act(() => auth.receive?.('SIGNED_IN', session));
    expect(await screen.findByText(summary.referralCode)).toBeVisible();
    expect(screen.queryByText('請先以 LINE 登入')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '推薦碼' })).toBeEnabled();
  });

  it('retains the read failure message when a signed-in request fails', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    referral.fetchSummary.mockRejectedValue(new Error('NETWORK_ERROR'));
    showPage();
    expect(await screen.findByText('推薦碼資訊暫時無法讀取，請稍後再試')).toBeVisible();
    expect(screen.queryByText('請先以 LINE 登入')).not.toBeInTheDocument();
  });

  it.each(['MEMBER_SESSION_EXPIRED', 'AUTH_REQUIRED', 'LINE_IDENTITY_REQUIRED'])(
    'asks for LINE login when member data rejects the session with %s', async (message) => {
      auth.getSession.mockResolvedValue({ data: { session }, error: null });
      referral.fetchSummary.mockRejectedValue(new Error(message));
      showPage();
      expect(await screen.findByText('請先以 LINE 登入')).toBeVisible();
      expect(screen.queryByText('推薦碼資訊暫時無法讀取，請稍後再試')).not.toBeInTheDocument();
    },
  );

  it('does not restore an old member code after logout while the request is pending', async () => {
    let resolveSummary!: (value: typeof summary) => void;
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    referral.fetchSummary.mockImplementation(() => new Promise((resolve) => { resolveSummary = resolve; }));
    showPage();
    await waitFor(() => expect(resolveSummary).toBeTypeOf('function'));
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    act(() => auth.receive?.('SIGNED_OUT', null));
    expect(await screen.findByText('請先以 LINE 登入')).toBeVisible();
    await act(async () => { resolveSummary(summary); });
    expect(screen.queryByText(summary.referralCode)).not.toBeInTheDocument();
  });

  it('keeps the draft when the same session emits another signed-in event', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    showPage();
    await screen.findByText(summary.referralCode);
    const input = screen.getByRole('textbox', { name: '推薦碼' });
    fireEvent.change(input, { target: { value: 'MATRIX-FRIEND' } });
    act(() => auth.receive?.('SIGNED_IN', session));
    expect(input).toHaveValue('MATRIX-FRIEND');
    expect(screen.getByText(summary.referralCode)).toBeVisible();
  });

  it('does not redeem an old activation confirmation after the account changes', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    showPage();
    await screen.findByText(summary.referralCode);
    const dialog = await openActivationConfirmation();
    act(() => auth.receive?.('SIGNED_IN', nextSession));
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '確認' })); });
    expect(activation.redeem).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: '啟動碼' })).toHaveValue('');
  });

  it.each(['success', 'failure'])('ignores old activation %s after an account change', async (outcome) => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    activation.redeem.mockImplementationOnce(() => new Promise<void>((yes, no) => { resolve = yes; reject = no; }));
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    showPage();
    await screen.findByText(summary.referralCode);
    const dialog = await openActivationConfirmation();
    fireEvent.click(within(dialog).getByRole('button', { name: '確認' }));
    await waitFor(() => expect(activation.redeem).toHaveBeenCalledWith(code));
    act(() => auth.receive?.('SIGNED_IN', nextSession));
    await act(async () => {
      if (outcome === 'success') resolve();
      else reject(Object.assign(new Error('used'), { code: 'ACTIVATION_CODE_ALREADY_USED' }));
    });
    expect(screen.getByRole('textbox', { name: '啟動碼' })).toHaveValue('');
    expect(screen.queryByText('啟動成功')).not.toBeInTheDocument();
    expect(screen.queryByText('啟動碼已使用')).not.toBeInTheDocument();
  });
});
