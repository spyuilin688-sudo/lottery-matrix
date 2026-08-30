// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const memberApi = vi.hoisted(() => ({
  fetchPendingTransferRequest: vi.fn(),
  fetchMemberPaymentHistory: vi.fn(),
  submitTransferRequest: vi.fn(),
}));
const selection = vi.hoisted(() => ({
  readManualTransferPlan: vi.fn(),
  saveManualTransferPlan: vi.fn(),
}));
vi.mock('../member-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../member-api')>(),
  ...memberApi,
}));
vi.mock('../manual-transfer-selection', () => selection);
vi.mock('../dialog/AppDialog', () => ({
  useAppDialog: () => ({ confirm: vi.fn().mockResolvedValue(true), alert: vi.fn() }),
}));

import { ManualTransferPage, PaymentHistoryPage, ProPlansPage } from '../FeaturePages';

describe('Matrix Pro manual bank transfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selection.readManualTransferPlan.mockReturnValue('month');
    memberApi.fetchPendingTransferRequest.mockResolvedValue(null);
    memberApi.fetchMemberPaymentHistory.mockResolvedValue([]);
    memberApi.submitTransferRequest.mockResolvedValue({
      id: 'transfer-1', planName: '月費方案', amount: 1880,
      accountLastFive: '12345', submittedAt: '2026-08-30T08:00:00Z', status: 'pending',
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('only opens bank details after plan payment confirmation', async () => {
    const onNavigate = vi.fn();
    render(<ProPlansPage onNavigate={onNavigate} />);

    expect(screen.queryByText('111023004501')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '確定付款' })).toHaveClass('primary-action', 'branded-explore-action');
    expect(screen.getByRole('checkbox', { name: '自動續訂' })).toBeDisabled();
    expect(screen.getByText(/手動轉帳不會自動扣款/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '確定付款' }));

    await waitFor(() => expect(selection.saveManualTransferPlan).toHaveBeenCalledWith('month'));
    expect(onNavigate).toHaveBeenCalledWith('manual-transfer');
  });

  it('shows bank data, copies the account, sanitizes last five digits and submits', async () => {
    render(<ManualTransferPage onNavigate={vi.fn()} />);

    expect(await screen.findByText('連線銀行')).toBeInTheDocument();
    expect(screen.getByText('824')).toBeInTheDocument();
    expect(screen.getByText('111023004501')).toBeInTheDocument();
    expect(screen.getByText('黎小姐')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '複製帳號' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('111023004501');

    fireEvent.change(screen.getByLabelText('帳號末五碼'), { target: { value: '12a3456' } });
    expect(screen.getByLabelText('帳號末五碼')).toHaveValue('12345');
    fireEvent.click(screen.getByRole('button', { name: '提交' }));

    await waitFor(() => expect(memberApi.submitTransferRequest).toHaveBeenCalledWith('month', '12345'));
    expect(await screen.findByText('待確認')).toBeInTheDocument();
  });

  it('blocks another submission while one request is pending', async () => {
    memberApi.fetchPendingTransferRequest.mockResolvedValue({
      id: 'pending-1', planName: '月費方案', amount: 1880,
      accountLastFive: '54321', submittedAt: '2026-08-30T08:00:00Z', status: 'pending',
    });
    render(<ManualTransferPage onNavigate={vi.fn()} />);

    expect(await screen.findByText('已有待確認申請')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交' })).toBeDisabled();
  });

  it('returns to plans without exposing bank data when no plan was selected', async () => {
    selection.readManualTransferPlan.mockReturnValue(null);
    const onNavigate = vi.fn();
    render(<ManualTransferPage onNavigate={onNavigate} />);

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('pro-plans'));
    expect(screen.queryByText('111023004501')).not.toBeInTheDocument();
  });

  it('renders authenticated member payment history', async () => {
    memberApi.fetchMemberPaymentHistory.mockResolvedValue([{
      id: 'payment-1', planName: '季費方案', amount: 4580,
      submittedAt: '2026-08-30T08:00:00Z', status: 'confirmed',
    }]);
    render(<PaymentHistoryPage onNavigate={vi.fn()} />);

    expect(document.querySelector('.payment-history-screen')).toBeInTheDocument();
    expect(await screen.findByText('季費方案')).toBeInTheDocument();
    expect(screen.getByText('NT$4,580')).toBeInTheDocument();
    expect(screen.getByText('已確認')).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });
});
