// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { render } from '../../test/render-with-dialog';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn() }));
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ auth }) }));

import { FeaturePageRouter } from '../features/router';

const lineSession = { access_token: 'test-session', user: { id: 'line-user', app_metadata: { provider: 'custom:line' }, identities: [] } };
const authListeners = new Set<(event: string, session: unknown) => void>();
const emitAuth = (event: string, session: unknown) => {
  for (const listener of authListeners) listener(event, session);
};

beforeEach(() => {
  window.localStorage.clear();
  authListeners.clear();
  vi.clearAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  auth.onAuthStateChange.mockImplementation((callback) => {
    authListeners.add(callback);
    return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } };
  });
});

test.each([['notebook', 'Matrix 筆記本']] as const)('guest cannot mount %s and receives a LINE login dialog', async (route, title) => {
  const navigate = vi.fn();
  const { container } = render(<FeaturePageRouter screen={route} onNavigate={navigate} />);
  expect(container.querySelector('.matrix-notebook-screen')).toBeNull();
  expect(await screen.findByRole('dialog', { name: '請先登入' })).toHaveTextContent(`請先登入後再使用 ${title}`);
  expect(navigate).not.toHaveBeenCalled();
  expect(window.localStorage.getItem('matrix-notebook-entries')).toBeNull();
});

test('a LINE member can enter the notebook without a Pro condition', async () => {
  auth.getSession.mockResolvedValue({ data: { session: lineSession }, error: null });
  render(<FeaturePageRouter screen="notebook" onNavigate={vi.fn()} />);
  expect(await screen.findByRole('button', { name: '新增筆記' })).toBeVisible();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(auth.getSession).toHaveBeenCalledTimes(1);
  expect(auth.onAuthStateChange).toHaveBeenCalledTimes(1);
});

test('the router-owned notebook session switches local ownership without a second auth chain', async () => {
  const nextSession = { access_token: 'next-session', user: { id: 'next-user', app_metadata: { provider: 'google' }, identities: [] } };
  window.localStorage.setItem('matrix-notebook:v2:line-user', JSON.stringify({ notes: [
    { id: 'line-note', title: 'LINE 帳號筆記', content: 'A', updatedAt: '2026-09-22T00:00:00Z' },
  ] }));
  window.localStorage.setItem('matrix-notebook:v2:next-user', JSON.stringify({ notes: [
    { id: 'next-note', title: 'Google 帳號筆記', content: 'B', updatedAt: '2026-09-22T00:00:00Z' },
  ] }));
  auth.getSession.mockResolvedValue({ data: { session: lineSession }, error: null });

  render(<FeaturePageRouter screen="notebook" onNavigate={vi.fn()} />);
  expect(await screen.findByText('LINE 帳號筆記')).toBeVisible();
  expect(auth.getSession).toHaveBeenCalledTimes(1);
  expect(auth.onAuthStateChange).toHaveBeenCalledTimes(1);

  act(() => emitAuth('SIGNED_IN', nextSession));

  expect(await screen.findByText('Google 帳號筆記')).toBeVisible();
  await waitFor(() => expect(screen.queryByText('LINE 帳號筆記')).toBeNull());
  expect(auth.getSession).toHaveBeenCalledTimes(1);
  expect(auth.onAuthStateChange).toHaveBeenCalledTimes(1);
});

test('a Google member can enter the notebook without a Pro condition', async () => {
  auth.getSession.mockResolvedValue({ data: { session: {
    access_token: 'google-session',
    user: { id: 'google-user', app_metadata: { provider: 'google' }, identities: [] },
  } }, error: null });
  render(<FeaturePageRouter screen="notebook" onNavigate={vi.fn()} />);
  expect(await screen.findByRole('button', { name: '新增筆記' })).toBeVisible();
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('signing out removes the protected page immediately', async () => {
  auth.getSession.mockResolvedValue({ data: { session: lineSession }, error: null });
  render(<FeaturePageRouter screen="notebook" onNavigate={vi.fn()} />);
  await screen.findByRole('button', { name: '新增筆記' });
  act(() => emitAuth('SIGNED_OUT', null));
  expect(screen.queryByRole('button', { name: '新增筆記' })).toBeNull();
  expect(await screen.findByRole('dialog', { name: '請先登入' })).toBeVisible();
});

test('sign-out keeps the existing page navigation available without redirecting home', async () => {
  auth.getSession.mockResolvedValue({ data: { session: lineSession }, error: null });
  const navigate = vi.fn();
  render(<div className="mobile-page"><FeaturePageRouter screen="notebook" onNavigate={navigate} /></div>);
  await screen.findByRole('button', { name: '新增筆記' });
  act(() => emitAuth('SIGNED_OUT', null));
  const dialog = await screen.findByRole('dialog', { name: '請先登入' });
  fireEvent.click(dialog.querySelector('button')!);
  expect(await screen.findByRole('navigation', { name: '底部導覽' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '新增筆記' })).toBeNull();
  expect(navigate).not.toHaveBeenCalled();
});

test('a delayed session read cannot reopen the page after sign out', async () => {
  let resolveSession!: (value: unknown) => void;
  auth.getSession.mockReturnValue(new Promise((resolve) => { resolveSession = resolve; }));
  render(<FeaturePageRouter screen="notebook" onNavigate={vi.fn()} />);
  await waitFor(() => expect(auth.getSession).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: '新增筆記' })).toBeNull();
  act(() => emitAuth('SIGNED_OUT', null));
  await act(async () => resolveSession({ data: { session: lineSession }, error: null }));
  expect(screen.queryByRole('button', { name: '新增筆記' })).toBeNull();
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});

test('a session read failure keeps the page closed and explains the failure', async () => {
  auth.getSession.mockRejectedValue(new Error('network'));
  render(<FeaturePageRouter screen="notebook" onNavigate={vi.fn()} />);
  expect(await screen.findByRole('dialog', { name: '登入狀態確認失敗' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '新增筆記' })).toBeNull();
});
