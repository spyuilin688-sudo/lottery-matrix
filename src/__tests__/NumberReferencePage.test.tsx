// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { NumberReferencePage } from '../FeaturePages';

beforeEach(() => {
  document.body.innerHTML = '';
  window.localStorage.clear();
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ records: [] }),
  }) as typeof fetch;
  window.requestAnimationFrame = (callback) => {
    callback(0);
    return 1;
  };
});

test('從列表底部展開探索設定時直接顯示設定且不捲動畫面', () => {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  const mobilePage = document.createElement('div');
  mobilePage.className = 'mobile-page';
  const root = document.createElement('div');
  mobilePage.append(root);
  document.body.append(mobilePage);
  render(<NumberReferencePage onNavigate={vi.fn()} />, { container: root });

  const header = mobilePage.querySelector<HTMLElement>('.feature-brand-header');
  Object.defineProperty(mobilePage, 'offsetWidth', { configurable: true, value: 390 });
  vi.spyOn(mobilePage, 'getBoundingClientRect').mockReturnValue({ top: 23, width: 195 } as DOMRect);
  vi.spyOn(header!, 'getBoundingClientRect').mockReturnValue({ bottom: 123 } as DOMRect);

  const toggle = screen.getByRole('button', { name: '收合探索設定' });
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole('button', { name: '展開探索設定' }));

  const dialog = screen.getByRole('dialog', { name: '探索設定' });
  expect(dialog.hidden).toBe(false);
  expect(dialog.getAttribute('data-floating')).toBe('true');
  expect(dialog.parentElement).toBe(mobilePage);
  expect(dialog.style.top).toBe('208px');
  expect(dialog.style.getPropertyValue('--select-tech-surface')).toBe('#030b13');
  expect(scrollIntoView).not.toHaveBeenCalled();
});

test('點擊已有號碼的輸入框時選取原號碼供直接取代', () => {
  render(<NumberReferencePage onNavigate={vi.fn()} />);

  const input = screen.getByRole('textbox', { name: '探索號碼 1' }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: '02' } });
  fireEvent.click(input);

  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(2);
});

test('已存在 01 到 04 時仍可輸入 11 到 49', () => {
  render(<NumberReferencePage onNavigate={vi.fn()} />);
  const first = screen.getByRole('textbox', { name: '探索號碼 1' }) as HTMLInputElement;
  const second = screen.getByRole('textbox', { name: '探索號碼 2' }) as HTMLInputElement;

  for (const [existing, values] of [
    ['01', ['11', '19']],
    ['02', ['21', '29']],
    ['03', ['31', '39']],
    ['04', ['41', '49']],
  ] as const) {
    fireEvent.change(first, { target: { value: existing } });
    for (const value of values) {
      fireEvent.change(second, { target: { value: value[0] } });
      expect(second.value).toBe(value[0]);
      fireEvent.change(second, { target: { value } });
      expect(second.value).toBe(value);
    }
    fireEvent.change(first, { target: { value: '' } });
    fireEvent.change(second, { target: { value: '' } });
  }
});
