// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
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
