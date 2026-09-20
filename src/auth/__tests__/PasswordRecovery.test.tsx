// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PasswordRecovery } from '../PasswordRecovery';
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn(), updateUser: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ getPasswordRecoveryClient: () => ({ auth: mocks }) }));
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'recovery-user' } } }, error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'recovery-user' } }, error: null });
  mocks.updateUser.mockResolvedValue({ data: { user: { id: 'recovery-user' } }, error: null });
});
async function openForm() {
  render(<StrictMode><PasswordRecovery /></StrictMode>);
  return screen.findByLabelText('新密碼');
}
function fillPassword(password = 'a-new-test-password', confirm = password) {
  fireEvent.change(screen.getByLabelText('新密碼'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('再次輸入新密碼'), { target: { value: confirm } });
}
describe('password recovery', () => {
  it('verifies the recovery session before presenting an accessible password form', async () => {
    let resolve!: (value: unknown) => void;
    mocks.getUser.mockReturnValue(new Promise(done => { resolve = done; }));
    render(<PasswordRecovery />);
    expect(screen.getByRole('status')).toHaveTextContent('正在驗證重設連結');
    expect(screen.queryByLabelText('新密碼')).not.toBeInTheDocument();
    await act(async () => { resolve({ data: { user: { id: 'recovery-user' } }, error: null }); });
    const input = await screen.findByLabelText('新密碼');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'new-password');
    expect(input.closest('form')).toHaveAttribute('novalidate');
    expect(screen.queryByText(/LINE/)).not.toBeInTheDocument();
  });
  it.each([
    { data: { session: null }, error: null },
    { data: { session: null }, error: { message: 'expired' } },
  ])('keeps invalid recovery links out of the normal login flow', async (result) => {
    mocks.getSession.mockResolvedValue(result);
    render(<PasswordRecovery />);
    expect(await screen.findByRole('alert')).toHaveTextContent('重設連結已失效');
    expect(screen.queryByLabelText('新密碼')).not.toBeInTheDocument();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it('rejects an unverified or mismatched account', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'other-user' } }, error: null });
    render(<PasswordRecovery />);
    expect(await screen.findByRole('alert')).toHaveTextContent('重設連結已失效');
    expect(screen.queryByLabelText('新密碼')).not.toBeInTheDocument();
  });
  it('validates required and matching passwords and focuses the invalid field', async () => {
    const password = await openForm();
    fireEvent.click(screen.getByRole('button', { name: '更新密碼' }));
    expect(screen.getByRole('alert')).toHaveTextContent('請輸入新密碼');
    expect(password).toHaveFocus();
    fillPassword('a-new-test-password', 'different');
    fireEvent.click(screen.getByRole('button', { name: '更新密碼' }));
    expect(screen.getByRole('alert')).toHaveTextContent('兩次輸入的密碼不一致');
    expect(screen.getByLabelText('再次輸入新密碼')).toHaveFocus();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it('submits only once while pending and clears both passwords after confirmed success', async () => {
    let resolve!: (value: unknown) => void;
    mocks.updateUser.mockReturnValue(new Promise(done => { resolve = done; }));
    await openForm();
    fillPassword();
    const form = screen.getByLabelText('新密碼').closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledTimes(1));
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'a-new-test-password' });
    expect(screen.getByRole('button', { name: '更新中…' })).toBeDisabled();
    await act(async () => { resolve({ data: { user: { id: 'recovery-user' } }, error: null }); });
    expect(await screen.findByRole('status')).toHaveTextContent('密碼已更新');
    expect(screen.queryByLabelText('新密碼')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回樂彩' })).toHaveAttribute('href', '/');
  });
  it('keeps server password errors recoverable without claiming success', async () => {
    mocks.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { code: 'weak_password' } });
    await openForm();
    fillPassword();
    fireEvent.click(screen.getByRole('button', { name: '更新密碼' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('密碼太容易被猜到');
    expect(screen.getByLabelText('新密碼')).toHaveValue('a-new-test-password');
    expect(screen.queryByText('密碼已更新')).not.toBeInTheDocument();
    fillPassword('another-test-password');
    fireEvent.click(screen.getByRole('button', { name: '更新密碼' }));
    expect(await screen.findByRole('status')).toHaveTextContent('密碼已更新');
  });
  it('does not update a different user if the recovery session changes before submission', async () => {
    await openForm();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'other-user' } }, error: null });
    fillPassword();
    fireEvent.click(screen.getByRole('button', { name: '更新密碼' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('重設連結已失效');
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
