// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentReversalPanel } from './PaymentReversalPanel';
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';

const adminOperationsCss = readFileSync(new NodeURL('./admin-operations.css', import.meta.url), 'utf8');

const paymentReversalTextareaCss = [...adminOperationsCss.matchAll(/\.paymentReversalForm textarea\s*\{[^}]+\}/g)]
  .map(([rule]) => rule)
  .join('\n');

const payment = {
  id: 'payment-1', memberId: 'member-1', lineDisplayName: '王小明', planName: '月費方案',
  amount: 2880, paidAt: '2026-09-01T02:00:00Z', status: 'confirmed',
};
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

async function renderPanel(overrides: Partial<Parameters<typeof PaymentReversalPanel>[0]> = {}) {
  const props = {
    payments: [payment], canEdit: true, confirm: vi.fn(async () => true),
    onRecord: vi.fn(async () => undefined), onRefresh: vi.fn(async () => undefined), ...overrides,
  };
  await act(async () => root.render(<PaymentReversalPanel {...props} />));
  return props;
}

function button(name: string) {
  return Array.from(container.querySelectorAll('button')).find((element) =>
    element.textContent === name || element.getAttribute('aria-label') === name) as HTMLButtonElement;
}

function openForm() {
  act(() => button('記錄沖銷 payment-1').click());
}

function select(name: string) {
  return container.querySelector(`select[aria-label="${name}"]`) as HTMLSelectElement;
}

function textarea(name: string) {
  return container.querySelector(`textarea[aria-label="${name}"]`) as HTMLTextAreaElement;
}

function change(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  act(() => {
    const prototype = element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('PaymentReversalPanel', () => {
  it('keeps the entire payment history card collapsed until the administrator expands it', async () => {
    await renderPanel();
    const disclosure = container.querySelector('details.paymentReversalPanel') as HTMLDetailsElement;

    expect(disclosure).toBeTruthy();
    expect(disclosure.open).toBe(false);
    expect(disclosure.querySelector('summary')?.textContent).toContain('付款紀錄與沖銷');
  });

  it('opens the card and exposes retry when payment history loading fails', async () => {
    await renderPanel({ payments: null, loadError: '付款紀錄載入失敗' });
    const disclosure = container.querySelector('details.paymentReversalPanel') as HTMLDetailsElement;

    expect(disclosure.open).toBe(true);
    expect(disclosure.querySelector('summary')?.textContent).toContain('讀取失敗');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('付款紀錄載入失敗');
  });

  it('distinguishes loading and failed reads from a confirmed empty history and retries inline', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    await renderPanel({ payments: null, loadError: '' });
    expect(container.querySelector('[role="status"]')?.textContent).toContain('付款紀錄載入中');
    expect(container.textContent).not.toContain('目前沒有付款紀錄');

    await act(async () => root.render(
      <PaymentReversalPanel
        payments={null}
        loadError="付款紀錄載入失敗"
        canEdit
        confirm={vi.fn()}
        onRecord={vi.fn()}
        onRefresh={onRefresh}
      />,
    ));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('付款紀錄載入失敗');
    expect(container.textContent).not.toContain('目前沒有付款紀錄');
    await act(async () => button('重新載入付款紀錄').click());
    expect(onRefresh).toHaveBeenCalledTimes(1);

    await act(async () => root.render(
      <PaymentReversalPanel payments={[]} canEdit confirm={vi.fn()} onRecord={vi.fn()} onRefresh={vi.fn()} />,
    ));
    expect(container.textContent).toContain('目前沒有付款紀錄');
  });

  it('shows actions only for editable confirmed payments and validates the reason with focus', async () => {
    await renderPanel({ payments: [payment, { ...payment, id: 'payment-2', status: 'refunded' }] });
    expect(button('記錄沖銷 payment-1')).toBeTruthy();
    expect(button('記錄沖銷 payment-2')).toBeFalsy();
    openForm();
    act(() => button('記錄已完成沖銷').click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('請填寫已完成沖銷的原因');
    expect(document.activeElement).toBe(textarea('沖銷原因'));

    await act(async () => root.render(
      <PaymentReversalPanel payments={[payment]} canEdit={false} confirm={vi.fn()} onRecord={vi.fn()} onRefresh={vi.fn()} />,
    ));
    expect(button('記錄沖銷 payment-1')).toBeFalsy();
  });

  it('keeps long reversal reasons readable with bounded auto-height and no manual resize', async () => {
    await renderPanel();
    openForm();
    const reason = textarea('沖銷原因');

    Object.defineProperty(reason, 'scrollHeight', { configurable: true, value: 120 });
    change(reason, '第一行\n第二行\n第三行');
    expect(reason.style.height).toBe('120px');

    Object.defineProperty(reason, 'scrollHeight', { configurable: true, value: 240 });
    change(reason, '更長的沖銷原因');
    expect(reason.style.height).toBe('160px');
    expect(paymentReversalTextareaCss).toMatch(/max-height:\s*160px;/);
    expect(paymentReversalTextareaCss).toMatch(/overflow-y:\s*auto;/);
    expect(paymentReversalTextareaCss).toMatch(/resize:\s*none;/);
  });

  it('uses the shared confirmation with exact consequences and does nothing when cancelled', async () => {
    const confirm = vi.fn<Parameters<typeof PaymentReversalPanel>[0]['confirm']>(async () => false);
    const onRecord = vi.fn();
    await renderPanel({ confirm, onRecord });
    openForm();
    change(select('完成類型'), 'chargeback');
    change(textarea('沖銷原因'), '收單行已完成刷退');
    await act(async () => button('記錄已完成沖銷').click());

    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: '確認記錄已完成刷退', confirmLabel: '記錄已刷退', tone: 'danger',
      message: expect.stringContaining('王小明（member-1）'),
    }));
    const message = confirm.mock.calls[0][0].message;
    expect(message).toContain('payment-1');
    expect(message).toContain('NT$2,880');
    expect(message).toContain('收單行已完成刷退');
    expect(message).toContain('推薦成功人數與 Matrix 資格會依剩餘有效付款重新計算');
    expect(onRecord).not.toHaveBeenCalled();
  });

  it('locks synchronously while confirmation is pending and releases the lock after cancellation', async () => {
    let resolveConfirmation!: (confirmed: boolean) => void;
    const confirm = vi.fn(() => new Promise<boolean>((resolve) => { resolveConfirmation = resolve; }));
    const onRecord = vi.fn();
    await renderPanel({ confirm, onRecord });
    openForm();
    change(textarea('沖銷原因'), '銀行退款已完成');

    const submit = button('記錄已完成沖銷');
    act(() => { submit.click(); submit.click(); });

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(submit.disabled).toBe(true);
    expect(submit.getAttribute('aria-busy')).toBe('true');

    await act(async () => resolveConfirmation(false));
    expect(onRecord).not.toHaveBeenCalled();
    expect(button('記錄已完成沖銷').disabled).toBe(false);
  });

  it('does not record after permission is revoked while confirmation is open', async () => {
    let resolveConfirmation!: (confirmed: boolean) => void;
    const confirm = vi.fn(() => new Promise<boolean>((resolve) => { resolveConfirmation = resolve; }));
    const onRecord = vi.fn();
    const props = await renderPanel({ confirm, onRecord });
    openForm();
    change(textarea('沖銷原因'), '銀行退款已完成');
    act(() => button('記錄已完成沖銷').click());

    await act(async () => root.render(<PaymentReversalPanel {...props} canEdit={false} />));
    await act(async () => resolveConfirmation(true));

    expect(onRecord).not.toHaveBeenCalled();
  });

  it('does not record after the panel unmounts while confirmation is open', async () => {
    let resolveConfirmation!: (confirmed: boolean) => void;
    const confirm = vi.fn(() => new Promise<boolean>((resolve) => { resolveConfirmation = resolve; }));
    const onRecord = vi.fn();
    await renderPanel({ confirm, onRecord });
    openForm();
    change(textarea('沖銷原因'), '銀行退款已完成');
    act(() => button('記錄已完成沖銷').click());

    await act(async () => root.render(<></>));
    await act(async () => resolveConfirmation(true));

    expect(onRecord).not.toHaveBeenCalled();
  });

  it('locks duplicate submission, preserves input on failure, and distinguishes refresh failure after success', async () => {
    let rejectRecord!: (reason: Error) => void;
    const onRecord = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectRecord = reject; }))
      .mockResolvedValueOnce(undefined);
    const onRefresh = vi.fn().mockRejectedValueOnce(new Error('reload failed'));
    await renderPanel({ onRecord, onRefresh });
    openForm();
    change(textarea('沖銷原因'), '銀行退款已完成');
    const submit = button('記錄已完成沖銷');
    act(() => { submit.click(); submit.click(); });
    await act(async () => Promise.resolve());
    expect(onRecord).toHaveBeenCalledTimes(1);
    expect(submit.disabled).toBe(true);
    expect(submit.getAttribute('aria-busy')).toBe('true');

    await act(async () => rejectRecord(new Error('服務暫時無法使用')));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('服務暫時無法使用');
    expect(textarea('沖銷原因').value).toBe('銀行退款已完成');

    await act(async () => button('重新記錄已完成沖銷').click());
    expect(onRecord).toHaveBeenCalledTimes(2);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('沖銷已記錄，但付款紀錄重新載入失敗');
    expect(container.textContent).not.toContain('服務暫時無法使用');
  });

  it('translates symbolic SQL errors into clear Traditional Chinese feedback', async () => {
    const onRecord = vi.fn().mockRejectedValue(new Error('PAYMENT_REVERSAL_CONFLICT'));
    await renderPanel({ onRecord });
    openForm();
    change(textarea('沖銷原因'), '銀行退款已完成');
    await act(async () => button('記錄已完成沖銷').click());

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('這筆付款已記錄其他沖銷結果');
    expect(container.querySelector('[role="alert"]')?.textContent).not.toContain('PAYMENT_REVERSAL_CONFLICT');
  });
});
