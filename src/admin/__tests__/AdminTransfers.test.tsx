// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransferView } from '../types';

const adminApi = vi.hoisted(() => ({ fetchTransfers: vi.fn(), reviewTransferRequest: vi.fn() }));
vi.mock('../api', () => adminApi);

import AdminTransfers from '../AdminTransfers';

const transfer: TransferView = {
  id: 'transfer-1', member_id: 'member-1', plan_id: 'plan-1', amount: 1880,
  transferred_at: '2026-08-30T08:00:00Z', account_last_five: '12345',
  submitted_at: '2026-08-30T08:01:00Z', status: 'pending',
  member: { id: 'member-1', line_user_id: 'line-member-1' }, plan: { name: '月費方案' },
};

describe('AdminTransfers review actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminApi.fetchTransfers.mockResolvedValue([transfer]);
    adminApi.reviewTransferRequest.mockResolvedValue({ ...transfer, status: 'confirmed' });
  });

  it('confirms a pending transfer and reloads the list', async () => {
    render(<AdminTransfers />);
    const buttons = await screen.findAllByRole('button', { name: '確認收款' });
    expect(buttons[0]).toBeEnabled();
    fireEvent.click(buttons[0]);

    await waitFor(() => expect(adminApi.reviewTransferRequest).toHaveBeenCalledWith(transfer.id, 'confirmed'));
    await waitFor(() => expect(adminApi.fetchTransfers).toHaveBeenCalledTimes(2));
  });

  it('rejects a pending transfer', async () => {
    render(<AdminTransfers />);
    fireEvent.click((await screen.findAllByRole('button', { name: '退回' }))[0]);
    await waitFor(() => expect(adminApi.reviewTransferRequest).toHaveBeenCalledWith(transfer.id, 'rejected'));
  });

  it.each(['confirmed', 'rejected'] as const)('disables actions for a %s transfer', async (status) => {
    adminApi.fetchTransfers.mockResolvedValue([{ ...transfer, status }]);
    render(<AdminTransfers />);
    expect((await screen.findAllByRole('button', { name: '確認收款' }))[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: '退回' })[0]).toBeDisabled();
  });
});
