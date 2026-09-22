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


test('首頁公告逐段播放新會員與最新彩種更新，不把所有文案串成同一條', () => {
  const { container } = render(<HomeAnnouncement {...({
    latestResults: [
      { lottery: '今彩539' },
      { lottery: '大樂透' },
    ],
  } as any)} />);
  const announcement = screen.getByTestId('home-announcement');
  expect(announcement).toHaveAccessibleName('公告');

  let track = container.querySelector<HTMLElement>('.home-announcement-track')!;
  expect(track).toHaveTextContent('【新會員限時體驗】立即使用 LINE 註冊登入，即可免費體驗 Matrix 探索、天衡、天樞十三期及完整範圍，體驗期限 2 天。');
  expect(track).not.toHaveTextContent('【今彩539】最新一期開獎資料、Matrix 分析結果已更新。');

  fireEvent.animationEnd(track);
  track = container.querySelector<HTMLElement>('.home-announcement-track')!;
  expect(track).toHaveTextContent('【今彩539】最新一期開獎資料、Matrix 分析結果已更新。');
  expect(track).not.toHaveTextContent('【大樂透】最新一期開獎資料、Matrix 分析結果已更新。');
  expect(screen.getByTestId('home-announcement-lottery-今彩539')).toHaveClass('home-announcement-lottery-name');

  fireEvent.animationEnd(track);
  track = container.querySelector<HTMLElement>('.home-announcement-track')!;
  expect(track).toHaveTextContent('【大樂透】最新一期開獎資料、Matrix 分析結果已更新。');
  expect(track).not.toHaveTextContent('09/23');
  expect(track).not.toHaveTextContent('02 34 35');
  expect(within(announcement).queryByRole('button')).not.toBeInTheDocument();
  expect(within(announcement).queryByRole('link')).not.toBeInTheDocument();
});

test('首頁公告在非同步彩種結果載入後從第一段重新開始，再逐段播放更新', () => {
  const { container, rerender } = render(<HomeAnnouncement latestResults={[]} />);
  const initialTrack = container.querySelector('.home-announcement-track');
  expect(initialTrack).not.toBeNull();

  rerender(<HomeAnnouncement {...({
    latestResults: [
      { lottery: '今彩539' },
      { lottery: '天天樂' },
      { lottery: '大樂透' },
      { lottery: '六合彩' },
    ],
  } as any)} />);

  let loadedTrack = container.querySelector<HTMLElement>('.home-announcement-track')!;
  expect(loadedTrack).not.toBe(initialTrack);
  expect(loadedTrack).toHaveTextContent('【新會員限時體驗】');
  expect(loadedTrack).not.toHaveTextContent('【今彩539】最新一期開獎資料、Matrix 分析結果已更新。');

  fireEvent.animationEnd(loadedTrack);
  loadedTrack = container.querySelector<HTMLElement>('.home-announcement-track')!;
  expect(loadedTrack).toHaveTextContent('【今彩539】最新一期開獎資料、Matrix 分析結果已更新。');
  expect(loadedTrack).not.toHaveTextContent('【天天樂】最新一期開獎資料、Matrix 分析結果已更新。');
});

test('首頁公告以原 18 秒首段校準速度，後續文案依距離調整時間而維持相同 px/s', () => {
  const rect = (width: number): DOMRect => ({
    x: 0, y: 0, width, height: 26,
    top: 0, right: width, bottom: 26, left: 0,
    toJSON: () => ({}),
  });
  const geometry = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.classList.contains('home-announcement')) return rect(358);
    if (this.classList.contains('home-announcement-track')) {
      return rect(this.textContent?.includes('新會員限時體驗') ? 700 : 420);
    }
    return rect(0);
  });

  try {
    const { container } = render(<HomeAnnouncement {...({
      latestResults: [{ lottery: '今彩539' }],
    } as any)} />);

    let track = container.querySelector<HTMLElement>('.home-announcement-track')!;
    expect(track.style.animationDuration).toBe('18s');
    const baselinePixelsPerSecond = (358 + 700) / 18;

    fireEvent.animationEnd(track);
    track = container.querySelector<HTMLElement>('.home-announcement-track')!;
    const nextSeconds = Number.parseFloat(track.style.animationDuration);
    expect(nextSeconds).toBeGreaterThan(0);
    expect((358 + 420) / nextSeconds).toBeCloseTo(baselinePixelsPerSecond, 5);
  } finally {
    geometry.mockRestore();
  }
});
