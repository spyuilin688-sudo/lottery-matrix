// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { HomeShortcutRow, MatrixCoreBanner } from '../Prototype';
import { BottomNavigation } from '../BottomNavigation';

test('首頁四大功能顯示可讀名稱，且分別開啟既有功能', () => {
  const navigate = vi.fn();
  render(<HomeShortcutRow onNavigate={navigate} />);
  const row = within(screen.getByRole('navigation', { name: '四大功能' }));
  expect(row.getAllByRole('button')).toHaveLength(4);
  expect(row.queryByRole('button', { name: /計算機/ })).not.toBeInTheDocument();

  for (const [label, destination] of [
    ['Matrix 同星', 'tongxing'],
    ['號碼對照單', 'reference'],
    ['Matrix 牌單', 'matrix-card'],
    ['Matrix 指南', 'guide'],
  ]) {
    const button = row.getByRole('button', { name: label });
    expect(button).toHaveTextContent(label);
    fireEvent.click(button);
    expect(navigate).toHaveBeenLastCalledWith(destination);
  }
  expect(navigate).toHaveBeenCalledTimes(4);
});

test('Core 保持獨立入口與可讀說明，計算機仍可從底部導覽開啟', () => {
  const openCore = vi.fn();
  const navigate = vi.fn();
  render(<><MatrixCoreBanner onOpen={openCore} /><BottomNavigation onNavigate={navigate} /></>);
  const core = screen.getByRole('button', { name: 'Matrix Core' });
  expect(core).toHaveTextContent('進入更深入的查詢');
  fireEvent.click(core);
  expect(openCore).toHaveBeenCalledTimes(1);
  fireEvent.click(within(screen.getByRole('navigation', { name: '底部導覽' })).getByRole('button', { name: '計算機' }));
  expect(navigate).toHaveBeenCalledWith('calculator');
});
