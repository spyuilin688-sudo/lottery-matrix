// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ArchitectureOverview } from './ArchitectureOverview';

afterEach(cleanup);

it('labels the actual invoice, payment date and unfinalized charges without turning them into a renewal date', async () => {
  render(<ArchitectureOverview client={{ get: async () => ({ data: { items: [{ provider: 'railway', plan: 'Pro', fee: 'US$20／月', renewalDate: null, verifiedAt: '2026-09-25T20:00:00Z', billing: { latestInvoiceAmount: 'US$37.12', latestInvoiceStatus: 'paid', latestPaymentDate: '2024-02-01', currentAmount: 'US$13.47', estimatedAmount: 'US$14.08', period: '2/1－3/1', source: 'Railway 工作區帳務頁', verifiedAt: '2024-02-15T00:00:00Z' } }] } }) }} />);
  const railway = screen.getByRole('article', { name: 'Railway' });
  await waitFor(() => expect(within(railway).getByText('最近帳單')).toBeTruthy());
  expect(within(railway).getByText('US$37.12（已付款）')).toBeTruthy();
  expect(within(railway).getByText('付款日期')).toBeTruthy();
  expect(within(railway).getByText('2024-02-01')).toBeTruthy();
  expect(within(railway).getByText('本期累計')).toBeTruthy();
  expect(within(railway).getByText('US$13.47')).toBeTruthy();
  expect(within(railway).getByText('預估金額')).toBeTruthy();
  expect(within(railway).getByText('US$14.08')).toBeTruthy();
  expect(within(railway).getByText('尚未取得')).toBeTruthy();
  expect(within(screen.getByRole('article', { name: 'GitHub' })).getByText('帳單尚未取得')).toBeTruthy();
});

it('shows the four providers, recorded subscription details and safe management links with one read under StrictMode', async () => {
  const get = vi.fn(async () => ({ data: { items: [
    { provider: 'railway', plan: 'Pro', fee: 'US$20／月', renewalDate: '2026-10-01', verifiedAt: '2026-09-25T20:00:00Z' },
  ] } }));
  render(<StrictMode><ArchitectureOverview client={{ get }} /></StrictMode>);
  const railway = screen.getByRole('article', { name: 'Railway' });
  await waitFor(() => expect(within(railway).getByText('Pro')).toBeTruthy());
  expect(within(railway).getByText('US$20／月')).toBeTruthy();
  expect(within(railway).getByText('2026-10-01')).toBeTruthy();
  expect(screen.getAllByRole('article')).toHaveLength(4);
  expect(within(screen.getByRole('article', { name: 'GitHub' })).getAllByText('尚未取得')).toHaveLength(3);
  for (const link of screen.getAllByRole('link', { name: /管理訂閱/ })) {
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('href')).toMatch(/^https:\/\//);
  }
  expect(get.mock.calls).toEqual([['/api/architecture-overview']]);
});

it('distinguishes a failed read from missing data and supports a single explicit retry', async () => {
  const get = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: { items: [] } });
  render(<ArchitectureOverview client={{ get }} />);
  await screen.findByRole('alert');
  expect(screen.getAllByRole('link')).toHaveLength(4);
  fireEvent.click(screen.getByRole('button', { name: '重新載入' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(get).toHaveBeenCalledTimes(2);
  expect(screen.getAllByText('尚未取得')).toHaveLength(12);
});

it('does not use a response from a closed view in the new administrator view', async () => {
  let finish!: (value: unknown) => void;
  const oldClient = { get: vi.fn(() => new Promise<{ data: unknown }>(resolve => { finish = value => resolve({ data: value }); })) };
  const oldView = render(<ArchitectureOverview client={oldClient} />);
  oldView.unmount();
  render(<ArchitectureOverview client={{ get: async () => ({ data: { items: [] } }) }} />);
  finish({ items: [{ provider: 'railway', plan: 'Old plan', fee: null, renewalDate: null, verifiedAt: null }] });
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  expect(screen.queryByText('Old plan')).toBeNull();
});
