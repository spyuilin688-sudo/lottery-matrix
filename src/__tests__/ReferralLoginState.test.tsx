// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  receive: null as null | ((event: string, session: unknown) => void),
}));
const referral = vi.hoisted(() => ({ fetchSummary: vi.fn() }));
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ auth }) }));
vi.mock('../member-api', async (original) => ({
  ...await original<typeof import('../member-api')>(),
  fetchMemberReferralSummary: referral.fetchSummary,
}));
import { ActivationCodePage } from '../features/MemberPages';
import { AppDialogProvider } from '../dialog/AppDialog';

const session = { user: { id: 'member-1' }, access_token: 'test-session' };
const summary = { referralCode: 'MATRIX-7H4K9P', referralSuccessCount: 3,
  hasInvitationCode: false, canSubmitReferralCode: true };
const showPage = () => render(<AppDialogProvider><ActivationCodePage onNavigate={vi.fn()} /></AppDialogProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  auth.onAuthStateChange.mockImplementation((receive) => {
    auth.receive = receive;
    return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
  });
  referral.fetchSummary.mockResolvedValue(summary);
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
});
