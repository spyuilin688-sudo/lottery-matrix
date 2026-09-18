// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NumberReferencePage } from '../features/NumberReferencePage';
import * as lotteryApi from '../lottery-api';
vi.mock('../lottery-api', async original => ({
  ...await original<typeof import('../lottery-api')>(),
  fetchLotteryHistory: vi.fn(),
}));
let scrollTop = 0;
beforeEach(() => {
  sessionStorage.clear(); scrollTop = 0;
  sessionStorage.setItem("matrix-quick:reference-range", JSON.stringify({ savedAt: Date.now(), value: "5000期" }));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    return { top: this.classList.contains('reference-window') ? -scrollTop : 0, bottom: 640, left: 0, right: 390, width: 390, height: 640, x: 0, y: 0, toJSON() {} };
  });
  vi.mocked(lotteryApi.fetchLotteryHistory).mockResolvedValue(Array.from({ length: 5000 }, (_, i) => ({ period: String(5000-i), numbers: ['01','02','03','04','05','06','07'] })));
});
afterEach(() => vi.restoreAllMocks());

test.each(['今彩539', '六合彩'])('%s: 5000 draws mount only visible rows and retain row/cell marks when scrolling away and back', async lottery => {
  sessionStorage.setItem('matrix-quick:reference-lottery', JSON.stringify({ savedAt: Date.now(), value: lottery }));
  render(<NumberReferencePage onNavigate={vi.fn()} />);
  const first = await screen.findByRole('button', { name: '1' });
  if (lottery === '六合彩') expect(within(first.closest('.reference-row')!).getByRole('button', { name: '特別號 07' })).not.toBeNull();
  fireEvent.click(first);
  fireEvent.click(within(first.closest('.reference-row')!).getByRole('button', { name: '號碼 01' }));
  expect(document.querySelectorAll('.reference-row:not(.head)').length).toBeLessThan(70);
  scrollTop = 159400;
  act(() => { fireEvent.scroll(document); });
  await screen.findByRole('button', { name: '5000' });
  expect(screen.queryByRole('button', { name: '1' })).toBeNull();
  expect(document.querySelectorAll('.reference-row:not(.head)').length).toBeLessThan(70);
  scrollTop = 0;
  act(() => { fireEvent.scroll(document); });
  await waitFor(() => expect(screen.getByRole('button', { name: '1' }).getAttribute('aria-pressed')).toBe('true'));
  expect(within(screen.getByRole('button', { name: '1' }).closest('.reference-row')!).getByRole('button', { name: '號碼 01' }).getAttribute('aria-pressed')).toBe('true');
});


test('a focused row stays mounted across scroll jumps until keyboard focus leaves it', async () => {
  render(<NumberReferencePage onNavigate={vi.fn()} />);
  const first = await screen.findByRole('button', { name: '1' });
  act(() => first.focus());
  scrollTop = 159400;
  act(() => { fireEvent.scroll(document); });
  await screen.findByRole('button', { name: '5000' });
  expect(document.activeElement).toBe(first);
  expect(first.isConnected).toBe(true);
  expect(document.querySelectorAll('.reference-row:not(.head)').length).toBeLessThan(70);
  act(() => first.blur());
  await waitFor(() => expect(screen.queryByRole('button', { name: '1' })).toBeNull());
});

test('scaled mobile scroll containers use unscaled row offsets', async () => {
  const scroller = document.createElement('div');
  scroller.style.overflowY = 'auto';
  Object.defineProperty(scroller, 'offsetHeight', { value: 1280 });
  Object.defineProperty(scroller, 'clientHeight', { value: 640 });
  document.body.append(scroller);
  render(<NumberReferencePage onNavigate={vi.fn()} />, { container: scroller });
  await screen.findByRole('button', { name: '1' });
  scrollTop = 1600;
  act(() => { fireEvent.scroll(scroller); });
  await screen.findByRole('button', { name: '101' });
  expect(screen.queryByRole('button', { name: '51' })).toBeNull();
});
