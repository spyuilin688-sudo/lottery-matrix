// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { HomeAnnouncement, HomeShortcutRow, MatrixCoreBanner } from '../Prototype';
import { BottomNavigation } from '../BottomNavigation';

test('首頁四大功能顯示可讀名稱，且分別開啟既有功能', () => {
  const navigate = vi.fn();
  render(<HomeShortcutRow onNavigate={navigate} />);
  const row = within(screen.getByRole('navigation', { name: '四大功能' }));
  expect(row.getAllByRole('button')).toHaveLength(4);
  expect(row.queryByRole('button', { name: /計算機/ })).not.toBeInTheDocument();

  for (const [label, destination] of [
    ['Matrix 同星', 'tongxing'],
    ['Matrix 對照', 'reference'],
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
  expect(core).toHaveTextContent('進入更深層的演算法');
  fireEvent.click(core);
  expect(openCore).toHaveBeenCalledTimes(1);
  fireEvent.click(within(screen.getByRole('navigation', { name: '底部導覽' })).getByRole('button', { name: '計算機' }));
  expect(navigate).toHaveBeenCalledWith('calculator');
});


test('首頁公告列保留新會員文案並列出最新日期已完整更新的彩種', () => {
  render(<HomeAnnouncement {...({
    latestResults: [
      { lottery: '今彩539' },
      { lottery: '大樂透' },
    ],
  } as any)} />);
  const announcement = screen.getByTestId('home-announcement');
  expect(announcement).toHaveAccessibleName('公告');
  expect(announcement).toHaveTextContent('【新會員限時體驗】立即使用 LINE 註冊登入，即可免費體驗 Matrix 探索、天衡、天樞十三期及完整範圍，體驗期限 2 天。');
  expect(announcement).toHaveTextContent('【今彩539】最新一期開獎資料、Matrix 分析結果已更新。');
  expect(announcement).toHaveTextContent('【大樂透】最新一期開獎資料、Matrix 分析結果已更新。');
  expect(announcement).not.toHaveTextContent('09/23');
  expect(announcement).not.toHaveTextContent('02 34 35');
  expect(screen.getByTestId('home-announcement-lottery-今彩539')).toHaveClass('home-announcement-lottery-name');
  expect(screen.getByTestId('home-announcement-lottery-大樂透')).toHaveClass('home-announcement-lottery-name');
  expect(within(announcement).queryByRole('button')).not.toBeInTheDocument();
  expect(within(announcement).queryByRole('link')).not.toBeInTheDocument();
});
