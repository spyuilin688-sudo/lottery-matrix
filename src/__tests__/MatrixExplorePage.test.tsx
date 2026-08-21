// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { MatrixExplorePage } from '../FeaturePages';

beforeEach(() => {
  document.body.innerHTML = '';
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ records: [] }),
  }) as typeof fetch;
});

test('近10期開獎號碼剛進頁面時保持展開', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  const toggle = screen.getByRole('button', { name: '收合近10期開獎號碼' });
  const table = document.querySelector<HTMLElement>('.history-table');

  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(toggle.getAttribute('aria-controls')).toBe('matrix-explore-history-table');
  expect(toggle.textContent).toContain('近10期開獎號碼');
  expect(toggle.textContent).not.toContain('依號碼由小到大排序');
  expect(toggle.querySelector('.section-title')).not.toBeNull();
  expect(toggle.querySelector('h2')).toBeNull();
  expect(table?.hidden).toBe(false);
});

test('近10期開獎號碼可用收合按鍵切換顯示狀態', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '收合近10期開獎號碼' }));

  expect(screen.getByRole('button', { name: '展開近10期開獎號碼' }).getAttribute('aria-expanded')).toBe('false');
  expect(document.querySelector<HTMLElement>('.history-table')?.hidden).toBe(true);
});

test('開始探索後自動收合近10期開獎號碼', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  expect(screen.getByRole('button', { name: '展開近10期開獎號碼' }).getAttribute('aria-expanded')).toBe('false');
  expect(document.querySelector<HTMLElement>('.history-table')?.hidden).toBe(true);
});

test('切換彩種時自動展開近10期開獎號碼', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '收合近10期開獎號碼' }));
  fireEvent.change(screen.getByRole('combobox', { name: '彩種' }), { target: { value: '六合彩' } });

  expect(screen.getByRole('button', { name: '收合近10期開獎號碼' }).getAttribute('aria-expanded')).toBe('true');
  expect(document.querySelector<HTMLElement>('.history-table')?.hidden).toBe(false);
});

test('近10期會預留 API 重複資料的去重空間並顯示完整 10 期', async () => {
  const uniqueRecords = Array.from({ length: 10 }, (_, index) => ({
    period: String(11974 - index),
    drawDate: `2026-08-${String(20 - index).padStart(2, '0')}`,
    numbers: ['01', '02', '03', '04', '05'],
  }));
  const duplicateHeavyRecords = uniqueRecords.flatMap((record, index) => (
    index < 5 ? Array.from({ length: 6 }, () => record) : Array.from({ length: 4 }, () => record)
  ));

  globalThis.fetch = vi.fn().mockImplementation(async (input) => {
    const requestUrl = new URL(String(input));
    const limit = Number(requestUrl.searchParams.get('limit'));
    return new Response(JSON.stringify({ items: duplicateHeavyRecords.slice(0, limit) }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  await waitFor(() => {
    expect(document.querySelectorAll('.history-row:not(.history-head)')).toHaveLength(10);
  });
  expect(globalThis.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/history/%E4%BB%8A%E5%BD%A9539?limit=50'),
    expect.anything(),
  );
});

test('展開版路後以可分色數字與右上外框標籤顯示版路概要', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  fireEvent.click(screen.getAllByRole('button', { name: /加減版路/ })[0]);

  const summary = document.querySelector<HTMLElement>('.validation-summary-card');
  expect(summary).not.toBeNull();
  expect(summary?.querySelector('.validation-summary-primary')?.textContent).toBe('10');
  expect(summary?.querySelectorAll('.validation-summary-position')).toHaveLength(2);
  expect(summary?.querySelector('.validation-summary-lookback')?.textContent).toBe('2');
  expect(summary?.querySelector('.validation-summary-formula')?.textContent).toBe('+14.24');
  expect(summary?.querySelector('.validation-summary-future')?.textContent).toBe('2');
  expect(summary?.querySelector('em')?.textContent).toBe('準7進8');
});

test('合值版路的概要顯示合值文字並沿用公式數字色彩類別', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '合值版路' }));
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  fireEvent.click(document.querySelector<HTMLButtonElement>('.road-type-toggle')!);

  expect(document.querySelector('.validation-summary-formula')?.textContent).toBe('合值14.24');
});
