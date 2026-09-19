// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { beforeEach, expect, test, vi } from 'vitest';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn() }));
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ auth }) }));

import { useNotebookOwner } from './notebook-owner';

const session = (id: string, provider: string) => ({
  access_token: `token-${id}`,
  user: { id, app_metadata: { provider }, identities: [{ provider, provider_id: 'provider-id' }] },
} as unknown as Session);
let emitAuth: (event: AuthChangeEvent, value: Session | null) => void;

beforeEach(() => {
  auth.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  auth.onAuthStateChange.mockReset().mockImplementation((callback) => {
    emitAuth = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

test.each(['custom:line', 'google'])('%s notebook ownership uses the authenticated user ID', async (provider) => {
  auth.getSession.mockResolvedValue({ data: { session: session('member-uuid', provider) }, error: null });
  const { result } = renderHook(useNotebookOwner);

  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.owner).toMatchObject({ userId: 'member-uuid', active: true });
});

test.each([
  null,
  session('', 'google'),
  session('   ', 'google'),
  { ...session('member-uuid', 'google'), access_token: '' },
])('does not grant notebook ownership without a member session (%#)', async (value) => {
  auth.getSession.mockResolvedValue({ data: { session: value }, error: null });
  const { result } = renderHook(useNotebookOwner);

  await waitFor(() => expect(result.current.status).toBe('signed-out'));
  expect(result.current.owner).toBeNull();
});

test('switching from LINE to Google invalidates the previous owner and logout rejects stale refreshes', async () => {
  auth.getSession.mockResolvedValue({ data: { session: session('line-uuid', 'custom:line') }, error: null });
  const { result } = renderHook(useNotebookOwner);
  await waitFor(() => expect(result.current.status).toBe('ready'));
  const lineOwner = result.current.owner!;
  const googleSession = session('google-uuid', 'google');

  act(() => emitAuth('SIGNED_IN', googleSession));
  expect(lineOwner.active).toBe(false);
  expect(result.current.owner).toMatchObject({ userId: 'google-uuid', active: true });
  const googleOwner = result.current.owner!;
  expect(googleOwner.revision).toBeGreaterThan(lineOwner.revision);

  act(() => emitAuth('SIGNED_OUT', null));
  expect(googleOwner.active).toBe(false);
  act(() => emitAuth('TOKEN_REFRESHED', googleSession));
  expect(result.current.status).toBe('signed-out');
  expect(result.current.owner).toBeNull();
});
