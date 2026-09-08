// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { MatrixExplorePage } from '../features/MatrixExplorePage';
import { MatrixTiangongPage } from '../features/MatrixTiangongPage';

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [] }) }) as typeof fetch;
});

test.each([
  ['explore', ['Matrix 天衍', 'Matrix 天工'], ['tianyan', 'tiangong']],
  ['tianyan', ['Matrix 探索', 'Matrix 天工'], ['explore', 'tiangong']],
  ['tiangong', ['Matrix 探索', 'Matrix 天衍'], ['explore', 'tianyan']],
] as const)('%s 在第一張探索設定標題同列顯示另外兩頁，僅點擊切換', (current, labels, destinations) => {
  const onNavigate = vi.fn();
  if (current === 'tiangong') render(<MatrixTiangongPage onNavigate={onNavigate} />);
  else render(<MatrixExplorePage onNavigate={onNavigate} title={current === 'tianyan' ? 'Matrix 天衍' : 'Matrix 探索'} />);

  const heading = screen.getByRole('heading', { name: '探索設定' });
  const nav = screen.getByRole('navigation', { name: 'Matrix Core 功能切換' });
  expect(heading.parentElement).toBe(nav.parentElement);
  expect(heading.closest('section')).toBe(document.querySelector('.feature-body > section'));
  expect(document.querySelector('.feature-brand-header .matrix-page-switcher')).toBeNull();
  const buttons = within(nav).getAllByRole('button');
  expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual(labels);
  expect(nav.querySelectorAll('button')).toHaveLength(2);
  fireEvent.scroll(nav, { target: { scrollTop: 100 } });
  expect(onNavigate).not.toHaveBeenCalled();
  buttons.forEach((button, index) => {
    fireEvent.click(button);
    expect(onNavigate).toHaveBeenNthCalledWith(index + 1, destinations[index]);
  });
});
