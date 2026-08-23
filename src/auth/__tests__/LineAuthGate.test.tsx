// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  bootstrapMember: vi.fn(),
  signInWithLine: vi.fn(),
  signOutFromMatrix: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
    },
  }),
}));

vi.mock('../../member-api', () => ({
  bootstrapMember: mocks.bootstrapMember,
}));

vi.mock('../line-auth', () => ({
  signInWithLine: mocks.signInWithLine,
  signOutFromMatrix: mocks.signOutFromMatrix,
}));

vi.mock('../../BrandLogo', () => ({
  BrandLogo: () => <div data-testid="brand-logo">樂彩 Matrix</div>,
}));

import { LineAuthGate } from '../LineAuthGate';

afterEach(cleanup);

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.onAuthStateChange.mockReset().mockReturnValue({
    data: { subscription: { unsubscribe: mocks.unsubscribe } },
  });
  mocks.unsubscribe.mockReset();
  mocks.bootstrapMember.mockReset().mockResolvedValue({ memberId: 'member-1', lineUserId: 'line-1' });
  mocks.signInWithLine.mockReset().mockResolvedValue(undefined);
  mocks.signOutFromMatrix.mockReset().mockResolvedValue(undefined);
});

describe('LineAuthGate', () => {
  it('shows the confirmed LINE login interface when no Supabase session exists', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });

    render(<LineAuthGate><div>authenticated-child</div></LineAuthGate>);

    expect(await screen.findByRole('button', { name: '使用 LINE 登入' })).toBeInTheDocument();
    expect(screen.getByText('SMART MATRIX · ENJOY LOTTERY')).toBeInTheDocument();
    expect(screen.getByText('登入即表示同意')).toBeInTheDocument();
    expect(screen.getByText('服務條款')).toBeInTheDocument();
    expect(screen.getByText('隱私權政策')).toBeInTheDocument();
    expect(screen.queryByText('authenticated-child')).not.toBeInTheDocument();
  });

  it('starts LINE OAuth from the formal site origin', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });

    render(<LineAuthGate><div>authenticated-child</div></LineAuthGate>);
    fireEvent.click(await screen.findByRole('button', { name: '使用 LINE 登入' }));

    expect(mocks.signInWithLine).toHaveBeenCalledWith(window.location.origin);
  });

  it('bootstraps a LINE member before rendering authenticated children', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'session-token', user: { id: 'auth-user-1' } } },
      error: null,
    });

    render(<LineAuthGate><div>authenticated-child</div></LineAuthGate>);

    await waitFor(() => expect(mocks.bootstrapMember).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('authenticated-child')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '使用 LINE 登入' })).not.toBeInTheDocument();
  });

  it('uses the existing profile logout button to clear the Supabase session', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'session-token', user: { id: 'auth-user-1' } } },
      error: null,
    });

    render(
      <LineAuthGate>
        <button type="button" className="profile-logout">登出</button>
      </LineAuthGate>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '登出' }));
    expect(mocks.signOutFromMatrix).toHaveBeenCalledTimes(1);
  });
});
