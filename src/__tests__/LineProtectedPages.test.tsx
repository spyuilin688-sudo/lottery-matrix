// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { render } from '../../test/render-with-dialog';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn() }));
const settings = vi.hoisted(() => ({ listCustomStatusSettings: vi.fn() }));
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ auth }) }));
vi.mock('../matrix-status-api', async (original) => ({ ...await original<typeof import('../matrix-status-api')>(), ...settings }));

import { FeaturePageRouter } from '../features/router';
import { MatrixStatusPage } from '../features/MatrixStatusPages';

const lineSession = { access_token: 'test-session', user: { id: 'line-user', app_metadata: { provider: 'custom:line' }, identities: [] } };
let emitAuth: (event: string, session: unknown) => void;

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  auth.onAuthStateChange.mockImplementation((callback) => {
    emitAuth = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  settings.listCustomStatusSettings.mockResolvedValue({ items: [], entitlements: { canCustomizeStatus: true } });
});

test.each([['notebook', 'Matrix 筆記本'], ['status-settings', '自訂觸發條件']] as const)('guest cannot mount %s and receives a LINE login dialog', async (route, title) => {
  const navigate = vi.fn();
  const { container } = render(<FeaturePageRouter screen={route} onNavigate={navigate} />);
  expect(container.querySelector('.matrix-notebook-screen, .matrix-custom-status-screen')).toBeNull();
  expect(await screen.findByRole('dialog', { name: '請先登入' })).toHaveTextContent(`請先使用 LINE 登入後再進入「${title}」。`);
  expect(navigate).not.toHaveBeenCalled();
  expect(settings.listCustomStatusSettings).not.toHaveBeenCalled();
  expect(window.localStorage.getItem('matrix-notebook-entries')).toBeNull();
});

test('a LINE member can enter the notebook without a Pro condition', async () => {
  auth.getSession.mockResolvedValue({ data: { session: lineSession }, error: null });
  render(<FeaturePageRouter screen="notebook" onNavigate={vi.fn()} />);
  expect(await screen.findByRole('button', { name: '新增筆記' })).toBeVisible();
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('a LINE member can enter custom conditions and load their settings', async () => {
  auth.getSession.mockResolvedValue({ data: { session: lineSession }, error: null });
  const { container } = render(<FeaturePageRouter screen="status-settings" onNavigate={vi.fn()} />);
  await waitFor(() => expect(container.querySelector('.matrix-custom-status-screen')).not.toBeNull());
  await waitFor(() => expect(settings.listCustomStatusSettings).toHaveBeenCalled());
});

test('a non-LINE session does not satisfy the LINE entry requirement', async () => {
  auth.getSession.mockResolvedValue({ data: { session: { ...lineSession, user: { ...lineSession.user, app_metadata: { provider: 'email' } } } }, error: null });
  render(<FeaturePageRouter screen="notebook" onNavigate={vi.fn()} />);
  expect(await screen.findByRole('dialog', { name: '請先登入' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '新增筆記' })).toBeNull();
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

test('the first tap on the custom-condition icon prompts a guest without navigating', async () => {
  const navigate = vi.fn();
  render(<div className="mobile-page"><MatrixStatusPage onNavigate={navigate} /></div>);
  fireEvent.click(await screen.findByRole('button', { name: '自訂觸發條件，連續點擊兩下開啟' }));
  expect(await screen.findByRole('dialog', { name: '請先登入' })).toHaveTextContent('LINE');
  expect(navigate).not.toHaveBeenCalled();
});

test('a logged-in double tap still opens custom conditions while the session read is pending', async () => {
  let finish!: (value: unknown) => void;
  auth.getSession.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const navigate = vi.fn();
  render(<div className="mobile-page"><MatrixStatusPage onNavigate={navigate} /></div>);
  const entry = await screen.findByRole('button', { name: '自訂觸發條件，連續點擊兩下開啟' });
  fireEvent.click(entry, { detail: 1 });
  fireEvent.click(entry, { detail: 1 });
  await act(async () => finish({ data: { session: lineSession }, error: null }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('status-settings'));
  expect(navigate).toHaveBeenCalledTimes(1);
});
