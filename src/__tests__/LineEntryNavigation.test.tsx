// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { render } from '../../test/render-with-dialog';
import { MobileDeviceProvider } from '../mobile/Device';
import { KeyboardProvider } from '../mobile/Keyboard';
import type { Navigate, ScreenId } from '../features/navigation';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn() }));
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ auth }) }));
vi.mock('../useLatestLotteryDraw', () => ({ useLatestLotteryDraw: () => ({ data: null }) }));
vi.mock('../matrix-status-api', () => ({ fetchMatrixStatus: () => new Promise(() => {}) }));
vi.mock('../onboarding/FirstVisitGuide', () => ({ FirstVisitGuide: () => null }));
// Keep the real shell/navigation handlers; replace unrelated page data loading.
vi.mock('../FeaturePagesPatched', () => ({
  FeaturePageRouter: ({ screen: route, onNavigate, onQuickOpen }: { screen: ScreenId; onNavigate: Navigate; onQuickOpen: () => void }) => <section>
    <h1>{route}</h1>
    <button onClick={() => onNavigate('status-settings')}>自訂觸發條件入口</button>
    <button onClick={() => onNavigate('profile')}>前往我的</button>
    <button onClick={onQuickOpen}>開啟快捷</button>
  </section>,
}));
import Prototype from '../Prototype';

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  disconnect() {}
  unobserve() {}
});

const lineSession = { access_token: 'test-session', user: { id: 'line-user', app_metadata: { provider: 'custom:line' } } };
const mount = () => render(<MobileDeviceProvider><KeyboardProvider><Prototype /></KeyboardProvider></MobileDeviceProvider>);
const openProfile = () => fireEvent.click(screen.getByRole('button', { name: '我的' }));

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

test('guest clicks custom conditions and stays on the originating page after dismissing the prompt', async () => {
  mount();
  openProfile();
  fireEvent.click(screen.getByRole('button', { name: '自訂觸發條件入口' }));
  expect(screen.getByRole('heading', { name: 'profile' })).toBeVisible();
  const dialog = await screen.findByRole('dialog', { name: '請先登入' });
  expect(dialog).toHaveTextContent('請先使用 LINE 登入');
  expect(screen.queryByRole('heading', { name: 'status-settings' })).toBeNull();
  fireEvent.click(within(dialog).getByRole('button'));
  expect(screen.getByRole('heading', { name: 'profile' })).toBeVisible();
  expect(screen.queryByTestId('lottery-screen')).toBeNull();
});

test('guest opens a saved notebook shortcut and stays on the current page', async () => {
  localStorage.setItem('matrix-quick-target', 'notebook');
  mount();
  openProfile();
  fireEvent.click(screen.getByRole('button', { name: '開啟快捷' }));
  expect(screen.getByRole('heading', { name: 'profile' })).toBeVisible();
  expect(await screen.findByRole('dialog', { name: '請先登入' })).toHaveTextContent('Matrix 筆記本');
  expect(screen.queryByRole('heading', { name: 'notebook' })).toBeNull();
});

test('guest selecting notebook in shortcut settings cannot enter or replace the shortcut', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: '快捷' }));
  fireEvent.click(screen.getByRole('button', { name: 'Matrix 筆記本' }));
  expect(await screen.findByRole('dialog', { name: '請先登入' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'notebook' })).toBeNull();
  expect(localStorage.getItem('matrix-quick-target')).toBeNull();
});

test('LINE login allows the existing shortcut open and return behavior', async () => {
  auth.getSession.mockResolvedValue({ data: { session: lineSession }, error: null });
  localStorage.setItem('matrix-quick-target', 'notebook');
  mount();
  openProfile();
  fireEvent.click(screen.getByRole('button', { name: '開啟快捷' }));
  expect(await screen.findByRole('heading', { name: 'notebook' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '開啟快捷' }));
  expect(screen.getByRole('heading', { name: 'profile' })).toBeVisible();
});

test('a late login check cannot override subsequent navigation', async () => {
  let finish!: (value: unknown) => void;
  auth.getSession.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  localStorage.setItem('matrix-quick-target', 'notebook');
  mount();
  fireEvent.click(screen.getByRole('button', { name: '快捷' }));
  await waitFor(() => expect(auth.getSession).toHaveBeenCalled());
  openProfile();
  await act(async () => finish({ data: { session: lineSession }, error: null }));
  expect(screen.getByRole('heading', { name: 'profile' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'notebook' })).toBeNull();
});
