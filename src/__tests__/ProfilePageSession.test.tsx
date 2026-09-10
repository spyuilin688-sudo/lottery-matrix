// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { render } from '../../test/render-with-dialog';
import { ProfilePage } from '../features/MemberPages';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn() }));
const member = vi.hoisted(() => ({ bootstrapMember: vi.fn(), fetchMemberProfile: vi.fn() }));
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ auth }) }));
vi.mock('../member-api', async importOriginal => ({ ...await importOriginal<typeof import('../member-api')>(), ...member }));
vi.mock('../auth/line-auth', () => ({ reconcilePendingLineLogoutPresence: vi.fn(), signInWithLine: vi.fn(), signOutFromMatrix: vi.fn() }));
vi.mock('../pwa-lifecycle', () => ({ usePwaLifecycle: () => ({ showInstallAction: false, requestInstall: vi.fn() }) }));
vi.mock('../subscription-purchase-visibility', () => ({ useSubscriptionPurchaseVisible: () => true }));
const session = (id: string): Session => ({
  access_token: id,
  refresh_token: `refresh-${id}`,
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id,
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: { name: id },
    created_at: '2026-09-10T00:00:00Z',
  },
});
let onSession: (event: string, session: Session | null) => void;
const profile = (name: string) => ({ lineUserId: name, planName: name, planExpiresAt: null, isLifetime: false });
beforeEach(() => {
  auth.getSession.mockReset().mockResolvedValue({ data: { session: session('a') }, error: null });
  auth.onAuthStateChange.mockReset().mockImplementation(callback => {
    onSession = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  member.bootstrapMember.mockReset().mockResolvedValue({});
  member.fetchMemberProfile.mockReset().mockResolvedValue(profile('方案 A'));
});

test('切換會員清除舊方案，重新取得新會員方案', async () => {
  render(<ProfilePage onNavigate={vi.fn()} />);
  await screen.findByText('方案 A');
  let resolve!: (value: ReturnType<typeof profile>) => void;
  member.fetchMemberProfile.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  act(() => onSession('SIGNED_IN', session('b')));
  expect(screen.queryByText('方案 A')).toBeNull();
  await waitFor(() => expect(member.fetchMemberProfile).toHaveBeenCalledTimes(2));
  await act(async () => resolve(profile('方案 B')));
  expect(screen.getByText('方案 B')).toBeTruthy();
  act(() => onSession('TOKEN_REFRESHED', { ...session('b'), access_token: 'b-refreshed' }));
  expect(member.fetchMemberProfile).toHaveBeenCalledTimes(2);
});

test('切換會員後忽略舊會員未完成的方案請求', async () => {
  let resolve!: (value: ReturnType<typeof profile>) => void;
  member.fetchMemberProfile.mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValueOnce(profile('方案 B'));
  render(<ProfilePage onNavigate={vi.fn()} />);
  await waitFor(() => expect(member.fetchMemberProfile).toHaveBeenCalledTimes(1));
  act(() => onSession('SIGNED_IN', session('b')));
  await screen.findByText('方案 B');
  await act(async () => resolve(profile('方案 A')));
  expect(screen.queryByText('方案 A')).toBeNull();
  expect(screen.getByText('方案 B')).toBeTruthy();
});
