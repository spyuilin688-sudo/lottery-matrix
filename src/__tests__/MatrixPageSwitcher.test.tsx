// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render } from '../../test/render-with-dialog';
import { fireEvent, screen, within } from '@testing-library/react';
// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { MatrixExplorePage } from '../features/MatrixExplorePage';
import { MatrixTiangongPage } from '../features/MatrixTiangongPage';

declare const process: { cwd(): string };

const style = document.createElement('style');

beforeAll(() => {
  style.textContent = [
    'src/feature-pages.css',
    'src/matrix-explore-spacing.css',
  ].map((path) => readFileSync(`${process.cwd()}/${path}`, 'utf8').replace(/^@import[^;]+;\s*/, '')).join('\n');
  document.head.append(style);
});

afterAll(() => {
  style.remove();
});

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [] }) }) as typeof fetch;
});

test.each([
  ['explore'],
  ['tianyan'],
  ['tiangong'],
] as const)('%s 在第一張探索設定標題同列固定顯示四頁，僅點擊切換', (current) => {
  const onNavigate = vi.fn();
  if (current === 'tiangong') render(<MatrixTiangongPage onNavigate={onNavigate} />);
  else render(<MatrixExplorePage onNavigate={onNavigate} title={current === 'tianyan' ? 'Matrix 天衍' : 'Matrix 探索'} />);

  const heading = screen.getByRole('heading', { name: '探索設定' });
  const nav = screen.getByRole('navigation', { name: 'Matrix Core 功能切換' });
  expect(heading.parentElement).toBe(nav.parentElement);
  expect(heading.closest('section')).toBe(document.querySelector('.feature-body > section'));
  expect(document.querySelector('.feature-brand-header .matrix-page-switcher')).toBeNull();
  const buttons = within(nav).getAllByRole('button');
  expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual([
    'Matrix 探索', 'Matrix 天衡', 'Matrix 天衍', 'Matrix 天工',
  ]);
  expect(nav.querySelectorAll('button')).toHaveLength(4);
  fireEvent.scroll(nav, { target: { scrollTop: 100 } });
  expect(onNavigate).not.toHaveBeenCalled();
  buttons.forEach((button, index) => {
    fireEvent.click(button);
    expect(onNavigate).toHaveBeenNthCalledWith(index + 1, ['explore', 'tianheng', 'tianyan', 'tiangong'][index]);
  });
});

test('四個 Matrix 切換圖示均完整顯示相同外框', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 探索" />);

  const nav = screen.getByRole('navigation', { name: 'Matrix Core 功能切換' });
  const buttons = within(nav).getAllByRole('button');

  expect(buttons).toHaveLength(4);
  buttons.forEach((button) => {
    const styles = getComputedStyle(button);
    expect(styles.borderTopWidth).toBe('1px');
    expect(styles.borderRightWidth).toBe('1px');
    expect(styles.borderBottomWidth).toBe('1px');
    expect(styles.borderLeftWidth).toBe('1px');
    expect(styles.borderTopColor).toBe('rgb(117, 83, 41)');
  });
});

test('僅將天衡圖示置中放大裁切以貼齊共用外框', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 探索" />);

  const nav = screen.getByRole('navigation', { name: 'Matrix Core 功能切換' });
  const tianhengImage = within(nav).getByRole('button', { name: 'Matrix 天衡' }).querySelector('img');
  const otherImages = within(nav).getAllByRole('button')
    .filter((button) => button.getAttribute('aria-label') !== 'Matrix 天衡')
    .map((button) => button.querySelector('img'));

  expect(tianhengImage).toHaveClass('matrix-page-switcher-image--tianheng');
  expect(getComputedStyle(tianhengImage!).transform).toBe('scale(1.14)');
  otherImages.forEach((image) => {
    expect(image).not.toHaveClass('matrix-page-switcher-image--tianheng');
    expect(getComputedStyle(image!).transform).not.toBe('scale(1.14)');
  });
});
