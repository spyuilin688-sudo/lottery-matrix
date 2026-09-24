// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { PaymentReversalPanel } from './PaymentReversalPanel';

it('identifies transfer report time without renaming provider payment time', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<PaymentReversalPanel
      payments={[
        { id: 'transfer-payment', memberId: 'member-1', amount: 100, paidAt: '2026-09-24T10:00:00Z', transferRequestId: 'transfer-1', status: 'confirmed' },
        { id: 'provider-payment', memberId: 'member-2', amount: 200, paidAt: '2026-09-24T11:00:00Z', transferRequestId: null, status: 'confirmed' },
      ]}
      canEdit={false}
      confirm={vi.fn(async () => false)}
      onRecord={vi.fn(async () => undefined)}
      onRefresh={vi.fn(async () => undefined)}
    />));
    const rows = [...container.querySelectorAll('.paymentReversalRow')];
    expect(rows[0].textContent).toContain('回報時間');
    expect(rows[0].textContent).not.toContain('付款時間');
    expect(rows[1].textContent).toContain('付款時間');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
