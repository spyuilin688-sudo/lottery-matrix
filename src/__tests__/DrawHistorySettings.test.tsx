// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { FeaturePageRouter } from '../FeaturePagesCore';

beforeEach(() => {
  document.body.innerHTML = '';
  window.sessionStorage.clear();
  globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ records: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch;
});

test('歷史篩選設定初始內嵌，探索後收合，再展開時固定為浮動設定卡', () => {
  const mobilePage = document.createElement('div');
  mobilePage.className = 'mobile-page';
  const root = document.createElement('div');
  mobilePage.append(root);
  document.body.append(mobilePage);
  Object.defineProperty(mobilePage, 'offsetWidth', { configurable: true, value: 390 });
  vi.spyOn(mobilePage, 'getBoundingClientRect').mockReturnValue({ top: 20, width: 195 } as DOMRect);

  render(<FeaturePageRouter screen="history" onNavigate={vi.fn()} />, { container: root });
  const header = mobilePage.querySelector<HTMLElement>('.feature-brand-header');
  vi.spyOn(header!, 'getBoundingClientRect').mockReturnValue({ bottom: 120 } as DOMRect);

  const inlinePanel = screen.getByRole('region', { name: '歷史篩選設定' });
  expect(inlinePanel.parentElement).not.toBe(mobilePage);
  expect(within(inlinePanel).getByRole('button', { name: '重設' }).parentElement?.classList.contains('history-filter-primary-row')).toBe(true);
  expect(within(header!.querySelector<HTMLElement>('.product-header__frame')!).queryByRole('button', { name: '重設' })).toBeNull();
  expect(screen.getByRole('combobox', { name: '彩種' })).not.toBeNull();
  expect(screen.getByRole('combobox', { name: '號碼順序' })).not.toBeNull();
  expect(screen.getByRole('combobox', { name: '年份' })).not.toBeNull();
  expect(screen.getByRole('combobox', { name: '月份' })).not.toBeNull();
  expect(screen.getByRole('combobox', { name: '日期' })).not.toBeNull();
  expect(screen.getByRole('combobox', { name: '探索範圍' })).not.toBeNull();
  expect(screen.getByRole('option', { name: '1000期' })).not.toBeNull();
  expect(screen.getByRole('option', { name: '3000期' })).not.toBeNull();
  expect(screen.getByRole('option', { name: '5000期' })).not.toBeNull();
  expect(screen.getByRole('option', { name: '所有期數' })).not.toBeNull();
  expect(screen.queryByRole('textbox')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(screen.getByRole('button', { name: '展開篩選設定' })).not.toBeNull();
  expect(screen.queryByRole('region', { name: '歷史篩選設定' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: '展開篩選設定' }));
  const dialog = screen.getByRole('dialog', { name: '歷史篩選設定' });
  expect(dialog.getAttribute('data-floating')).toBe('true');
  expect(header!.contains(dialog)).toBe(true);
  expect(dialog.getAttribute('style')).toBeNull();
  fireEvent.change(within(dialog).getByRole('combobox', { name: '號碼順序' }), { target: { value: '依實際開獎順序排序' } });
  fireEvent.change(within(dialog).getByRole('combobox', { name: '探索範圍' }), { target: { value: '3000期' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '重設' }));
  expect((screen.getByRole('combobox', { name: '號碼順序' }) as HTMLSelectElement).value).toBe('依號碼由小到大排序');
  expect((screen.getByRole('combobox', { name: '探索範圍' }) as HTMLSelectElement).value).toBe('1000期');
});
