// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppInfoPage } from './AppInfoPage';
const state = vi.hoisted(() => ({ getSession: vi.fn(), invoke: vi.fn(), signInWithOAuth: vi.fn(), getClient: vi.fn() }));
vi.mock('./app-info-client', () => ({ getAppInfoClient: state.getClient }));
beforeEach(() => {
  state.getClient.mockReturnValue({ auth: { getSession: state.getSession, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) , signInWithOAuth: state.signInWithOAuth }, functions: { invoke: state.invoke } });
  state.getSession.mockResolvedValue({ data: { session: { user: { id: 'app-user' } } }, error: null });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('a rejected session read leaves loading and offers authenticated recovery', async () => {
  state.getSession.mockRejectedValue(new Error('network'));
  render(<AppInfoPage path="/app-info/delete-account" />);
  await screen.findByText('登入狀態讀取失敗，請重新整理或驗證登入。');
  expect(screen.getByRole('button', { name: '使用 LINE 驗證登入' })).toBeTruthy();
  expect(state.invoke).not.toHaveBeenCalled();
});
it('privacy and unknown pages are public and never initialize member auth', () => {
  const view = render(<AppInfoPage path="/app-info/privacy" />);
  expect(screen.getByRole('heading', { name: '樂彩 Matrix App 隱私權政策' })).toBeTruthy();
  expect(state.getClient).not.toHaveBeenCalled();
  view.rerender(<AppInfoPage path="/app-info/unknown" />);
  expect(screen.getByRole('heading', { name: '找不到 App 說明頁面' })).toBeTruthy();
});
it('web deletion verifies ownership without App or PWA member bootstrap', async () => {
  state.invoke.mockResolvedValue({ data: { status: 'completed', authIdentity: 'retained' }, error: null });
  render(<AppInfoPage path="/app-info/delete-account" />);
  fireEvent.click(await screen.findByRole('checkbox', { name: /我已了解/ }));
  fireEvent.click(screen.getByRole('button', { name: '確認刪除 App 帳號' }));
  await screen.findByText('App 帳號已刪除。共用登入身分及其他產品資料保留。');
  expect(state.invoke).toHaveBeenCalledWith('app-account-delete', { body: {} });
  expect(state.getClient.mock.results[0].value.rpc).toBeUndefined();
});
it('logged-out deletion offers LINE and Google login without requiring App installation', async () => {
  state.getSession.mockResolvedValue({ data: { session: null }, error: null });
  state.signInWithOAuth.mockResolvedValue({ error: null });
  render(<AppInfoPage path="/app-info/delete-account" />);
  fireEvent.click(await screen.findByRole('button', { name: '使用 Google 驗證登入' }));
  await waitFor(() => expect(state.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google', options: expect.objectContaining({ redirectTo: expect.stringContaining('/app-info/delete-account') }) })));
});
