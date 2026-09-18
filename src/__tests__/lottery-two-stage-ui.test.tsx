// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { LatestDrawCard } from '../Prototype';
import { NumberReferencePage } from '../features/NumberReferencePage';
import { FeaturePageRouter } from '../FeaturePagesCore';
import { MatrixCardPage } from '../features/MatrixCardPage';
import { AppDialogProvider } from '../dialog/AppDialog';
import { resetReadCacheForTests } from '../read-cache';
const sorted = ['01', '08', '14', '25', '39'];
const preliminary = { period: '115209', drawDate: '2026/09/12' };
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); resetReadCacheForTests(); localStorage.clear(); sessionStorage.clear(); });
test('home retains preliminary period and date while actual balls remain absent', () => {
  render(<LatestDrawCard lottery="今彩539" order="落球" onOrderChange={vi.fn()} nextDrawInfo={{ nextDraw: '', remainingTime: '' }} result={{ issue: preliminary.period, date: preliminary.drawDate, numbers: sorted }} />);
  expect(screen.getByText('115209')).toBeTruthy();
  expect(screen.getByText('2026/09/12')).toBeTruthy();
  expect(document.querySelectorAll('.number-ball')).toHaveLength(0);
});


const actual = ['25', '01', '39', '08', '14'];
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const flush = async () => act(async () => { await vi.advanceTimersByTimeAsync(1); });

test.each(['reference', 'tongxing'] as const)('%s refreshes a submitted actual-order query without applying edited settings', async page => {
  vi.useFakeTimers();
  let current = { ...preliminary, numbers: sorted, sortedNumbers: sorted, drawOrderNumbers: [] as string[], resultStatus: 'preliminary' };
  const previous = { period: '115208', drawDate: '2026/09/11', numbers: sorted, sortedNumbers: sorted, drawOrderNumbers: actual };
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    const path = String(url);
    if (path.includes('/latest/')) return json(current);
    if (path.includes('/tongxing')) return json({ groups: [{
      lockedEntry: { ...previous, numbers: actual },
      predictedEntry: { ...current, numbers: current.drawOrderNumbers },
    }], nextCursor: null });
    return json({ items: [current, previous], nextCursor: null });
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  render(<AppDialogProvider>{page === 'reference' ? <NumberReferencePage onNavigate={vi.fn()} /> : <FeaturePageRouter screen="tongxing" onNavigate={vi.fn()} />}</AppDialogProvider>);
  await flush();
  fireEvent.change(screen.getByRole('combobox', { name: '號碼順序' }), { target: { value: '依實際開獎順序排序' } });
  if (page === 'tongxing') {
    fireEvent.change(screen.getByRole('textbox', { name: '號碼 1' }), { target: { value: '01' } });
    fireEvent.change(screen.getByRole('textbox', { name: '號碼 2' }), { target: { value: '08' } });
  }
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  await flush();
  const currentRow = () => screen.getByText('115209').closest(page === 'reference' ? '.reference-row' : '.tongxing-table-row')!;
  expect(currentRow().textContent).not.toContain('25');
  fireEvent.click(screen.getByRole('button', { name: page === 'reference' ? '展開探索設定' : '展開同星探索設定' }));
  fireEvent.change(screen.getByRole('combobox', { name: '彩種' }), { target: { value: '天天樂' } });
  current = { ...current, drawOrderNumbers: actual, resultStatus: 'confirmed' };
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(currentRow().textContent).not.toContain('25');
  await act(async () => { await vi.advanceTimersByTimeAsync(3_540_000); });
  expect(currentRow().textContent).toContain('25');
  expect((screen.getByRole('combobox', { name: '彩種' }) as HTMLSelectElement).value).toBe('天天樂');
  const cells = page === 'reference' ? within(currentRow() as HTMLElement).getAllByRole('button').slice(1).map(node => node.textContent) : Array.from(currentRow().children).slice(1).map(node => node.textContent);
  expect(cells).toEqual(actual);
  if (page === 'tongxing') {
    const calls = fetcher.mock.calls.filter(([url]) => String(url).includes('/tongxing'));
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(JSON.parse(String(calls.at(-1)?.[1]?.body))).toMatchObject({
      lottery: '今彩539', numberOrder: '依實際開獎順序排序', numbers: ['01', '08'],
    });
  }
});

test('sorted-only card disables actual order and updates when the formal card arrives', async () => {
  vi.useFakeTimers();
  let ready = false;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ lottery: '今彩539', period: '115209', cards: { sorted: { url: '/cards/115209/sorted.png' }, ...(ready ? { draw: { url: '/cards/115209/draw.png' } } : {}) } }));
  render(<AppDialogProvider><MatrixCardPage onNavigate={vi.fn()} /></AppDialogProvider>);
  await flush();
  expect(screen.getByRole('img', { name: '今彩539順球牌單，第 115209 期' })).toBeTruthy();
  expect((screen.getByRole('tab', { name: '落球' }) as HTMLButtonElement).disabled).toBe(true);
  ready = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect((screen.getByRole('tab', { name: '落球' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(3_540_000); });
  expect((screen.getByRole('tab', { name: '落球' }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole('tab', { name: '落球' }));
  expect(screen.getByRole('img', { name: '今彩539落球牌單，第 115209 期' }).getAttribute('src')).toContain('/115209/draw.png');
});

test('new preliminary period removes the previous actual card and cancels its pending confirmation', async () => {
  vi.useFakeTimers();
  let manifest = { lottery: '今彩539', period: '115208', cards: { sorted: { url: '/cards/115208/sorted.png' }, draw: { url: '/cards/115208/draw.png' } } };
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json(manifest));
  render(<AppDialogProvider><MatrixCardPage onNavigate={vi.fn()} /></AppDialogProvider>);
  await flush();
  fireEvent.click(screen.getByRole('tab', { name: '落球' }));
  fireEvent.click(screen.getByRole('button', { name: '下載牌單' }));
  await flush();
  manifest = { lottery: '今彩539', period: '115209', cards: { sorted: { url: '/cards/115209/sorted.png' } } } as typeof manifest;
  await act(async () => { await vi.advanceTimersByTimeAsync(3_600_000); });
  expect(document.querySelector('.matrix-ticket-image')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '確認' }));
  await flush();
  expect((screen.getByRole('button', { name: '下載牌單' }) as HTMLButtonElement).disabled).toBe(true);
  expect(fetcher.mock.calls.some(([url]) => String(url).includes('/115208/draw.png'))).toBe(false);
  fireEvent.click(screen.getByRole('tab', { name: '順球' }));
  expect(screen.getByRole('img', { name: '今彩539順球牌單，第 115209 期' })).toBeTruthy();
});

test.each(['依號碼由小到大排序', '依實際開獎順序排序'])('history advances to preliminary and replaces its corrected period in %s', async numberOrder => {
  vi.useFakeTimers();
  const previous = { period: '115208', drawDate: '2026/09/11', numbers: sorted, sortedNumbers: sorted, drawOrderNumbers: actual };
  let records: Array<typeof previous> = [previous];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => json(String(url).includes('/history-years/') ? { years: ['2026'] } : String(url).includes('/latest/') ? records[0] : { items: records }));
  render(<AppDialogProvider><FeaturePageRouter screen="history" onNavigate={vi.fn()} /></AppDialogProvider>);
  await flush();
  fireEvent.change(screen.getByRole('combobox', { name: '號碼順序' }), { target: { value: numberOrder } });
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  await flush();
  records = [{ ...preliminary, numbers: sorted, sortedNumbers: sorted, drawOrderNumbers: [] }, previous];
  await act(async () => { await vi.advanceTimersByTimeAsync(3_600_000); });
  const row = screen.getByText('115209').closest('.draw-history-row')!;
  expect(row.textContent).toContain('09/12');
  expect(row.querySelectorAll('.number-ball')).toHaveLength(numberOrder.includes('實際') ? 0 : 5);
  records = [{ ...records[0], period: '115210', drawOrderNumbers: actual }, previous];
  await act(async () => { await vi.advanceTimersByTimeAsync(3_600_000); });
  expect(screen.queryByText('115209')).toBeNull();
  expect(screen.getByText('115210').closest('.draw-history-row')!.querySelectorAll('.number-ball')).toHaveLength(5);
});
