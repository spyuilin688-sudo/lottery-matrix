// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminMemberPage } from './use-admin-member-page';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useAdminMemberPage subscription filters', () => {
  it('preserves the backend subscription filter and exact count', async () => {
    const get = vi.fn(async () => ({ data: {
      items: [
        { id: 'paid', currentPlanId: 'yearly', planName: '年費方案' },
      ],
      total: 61,
      currentPage: 1,
      totalPages: 3,
    } }));

    function Harness() {
      const page = useAdminMemberPage('subscriptions', 0, { get });
      return <div>{page.paged.items.map(item => item.id).join(',')}|{page.total}</div>;
    }

    await act(async () => { root.render(<Harness />); });
    await vi.waitFor(() => expect(container.textContent).toBe('paid|61'));
  });

  it('sends the compact plan filter and returns to page one when it changes', async () => {
    const get = vi.fn(async () => ({ data: { items: [], total: 0, currentPage: 1, totalPages: 1 } }));

    function Harness() {
      const page = useAdminMemberPage('subscriptions', 0, { get });
      return <button type="button" onClick={() => { page.setPage(3); page.setPlan('quarterly'); }}>{page.plan}</button>;
    }

    await act(async () => { root.render(<Harness />); });
    await vi.waitFor(() => expect(get).toHaveBeenCalled());
    await act(async () => { container.querySelector('button')?.click(); });
    await vi.waitFor(() => expect(get).toHaveBeenCalledWith('/api/data/subscriptions?page=1&keyword=&status=all&startDate=&endDate=&sortBy=planStartedAt&sortDirection=desc&plan=quarterly'));

    expect(get).toHaveBeenLastCalledWith('/api/data/subscriptions?page=1&keyword=&status=all&startDate=&endDate=&sortBy=planStartedAt&sortDirection=desc&plan=quarterly');
    expect(container.textContent).toBe('quarterly');
  });
});
