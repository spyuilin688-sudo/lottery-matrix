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
  globalThis.fetch = vi.fn().mockImplementation(async (input) => new Response(JSON.stringify(
    String(input).includes('/latest/') ? { item: null } : { items: [], nextCursor: null },
  ), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
});

test.each([
  ['explore', '探索設定'],
  ['tianheng', '天衡設定'],
  ['tianyan', '天衍設定'],
  ['tiangong', '天工設定'],
] as const)('%s 在第一張設定標題同列固定顯示四頁，僅點擊切換', (current, settingsHeading) => {
  const onNavigate = vi.fn();
  if (current === 'tiangong') render(<MatrixTiangongPage onNavigate={onNavigate} />);
  else render(<MatrixExplorePage onNavigate={onNavigate} title={current === 'tianyan' ? 'Matrix 天衍' : current === 'tianheng' ? 'Matrix 天衡' : 'Matrix 探索'} />);

  const heading = screen.getByRole('heading', { name: settingsHeading });
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

test('四個 Matrix 文字分段共用單一金褐色外框', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 探索" />);

  const nav = screen.getByRole('navigation', { name: 'Matrix Core 功能切換' });
  const buttons = within(nav).getAllByRole('button');
  const styles = getComputedStyle(nav);
  expect(styles.borderTopWidth).toBe('1px');
  expect(styles.borderRightWidth).toBe('1px');
  expect(styles.borderBottomWidth).toBe('1px');
  expect(styles.borderLeftWidth).toBe('1px');
  expect(styles.borderTopColor).toBe('rgba(117, 83, 41, 0.48)');
  expect(styles.borderRadius).toBe('8px');
  expect(styles.height).toBe('26px');
  expect(styles.width).toBe('176px');
  expect(buttons.map(button => button.textContent)).toEqual(['探索', '天衡', '天衍', '天工']);
  expect(nav.querySelector('img')).toBeNull();
});

test('當前 Matrix 頁面以粗體與淡金底標示並保留完整名稱', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 探索" />);

  const nav = screen.getByRole('navigation', { name: 'Matrix Core 功能切換' });
  const buttons = within(nav).getAllByRole('button');
  // Check the owned declaration directly: Vitest's CSSOM reports a transparent
  // background here, while standalone jsdom resolves the same DOM and CSS correctly.
  const currentRule = [...style.sheet!.cssRules].find((rule): rule is CSSStyleRule =>
    rule instanceof CSSStyleRule && rule.selectorText === '.matrix-page-switcher button[aria-current="page"]');
  expect(currentRule?.style.backgroundColor).toBe('rgba(244, 206, 103, 0.1)');
  expect(buttons.filter(button => button.matches(currentRule!.selectorText))).toEqual([buttons[0]]);
  buttons.forEach((button, index) => {
    expect(button).toHaveAttribute('title', ['Matrix 探索', 'Matrix 天衡', 'Matrix 天衍', 'Matrix 天工'][index]);
    const styles = getComputedStyle(button);
    if (index === 0) expect(styles.fontWeight).toBe('700');
    else expect(styles.fontWeight).not.toBe('700');
    if (index === 0) expect(button).toHaveAttribute('aria-current', 'page');
    else expect(button).not.toHaveAttribute('aria-current');
  });
});
