// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EcpayReviewLogin } from '../EcpayReviewLogin';
const login = vi.hoisted(() => vi.fn());
vi.mock('../ecpay-review-auth', () => ({ signInForEcpayReview: login }));
afterEach(cleanup);
beforeEach(() => { login.mockReset().mockResolvedValue(undefined); });
describe('review login dialog', () => {
  it('opens an accessible password form and closes on successful login', async () => {
    render(<EcpayReviewLogin />);
    fireEvent.click(screen.getByRole('button', { name: '綠界審核登入' }));
    expect(screen.getByRole('dialog', { name: '綠界審核登入' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('帳號'), { target: { value: 'review@example.test' } });
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'test-password' } });
    fireEvent.click(screen.getByRole('button', { name: '登入' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('keeps a failed login open, preserves the account and clears the password', async () => {
    login.mockRejectedValue(new Error('rejected'));
    render(<EcpayReviewLogin />);
    fireEvent.click(screen.getByRole('button', { name: '綠界審核登入' }));
    fireEvent.change(screen.getByLabelText('帳號'), { target: { value: 'review@example.test' } });
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '登入' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('帳號')).toHaveValue('review@example.test');
    expect(screen.getByLabelText('密碼')).toHaveValue('');
    expect(screen.getByRole('button', { name: '登入' })).toBeEnabled();
  });
  it('validates required input and returns focus to the triggering button on cancel', async () => {
    render(<EcpayReviewLogin />);
    const trigger = screen.getByRole('button', { name: '綠界審核登入' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: '登入' }));
    expect(screen.getByRole('alert')).toHaveTextContent('請輸入帳號與密碼');
    expect(login).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

it('prevents dismissal while the verified session is being committed', async () => {
  let complete!: () => void;
  login.mockImplementation((_email, _password, _signal, commit) => { commit(); return new Promise<void>(resolve => { complete = resolve; }); });
  render(<EcpayReviewLogin />);
  fireEvent.click(screen.getByRole('button', { name: '綠界審核登入' }));
  fireEvent.change(screen.getByLabelText('帳號'), { target: { value: 'review@example.test' } });
  fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: '登入' }));
  expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  complete();
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('accepts a plain username without browser email validation', async () => {
  render(<EcpayReviewLogin />);
  fireEvent.click(screen.getByRole('button', { name: '綠界審核登入' }));
  const account = screen.getByLabelText('帳號');
  expect(account).toHaveAttribute('type', 'text');
  fireEvent.change(account, { target: { value: 'admin' } });
  fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'test-password' } });
  expect((account as HTMLInputElement).checkValidity()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '登入' }));
  await waitFor(() => expect(login).toHaveBeenCalledWith('admin', 'test-password', expect.any(AbortSignal), expect.any(Function)));
});
