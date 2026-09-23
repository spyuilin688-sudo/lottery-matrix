// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { FeaturePageRouter } from '../FeaturePagesCore';
import { DrawHistoryPage } from '../features/LegacyHistoryPage';
import * as lotteryApi from '../lottery-api';

vi.mock('../lottery-api', async (original) => ({
  ...await original<typeof import('../lottery-api')>(),
  fetchLotteryHistory: vi.fn(),
  fetchLotteryHistoryYears: vi.fn(),
}));

const records = Array.from({ length: 51 }, (_, index) => ({
  period: String(11999 - index),
  drawDate: '2026/09/01',
  numbers: ['01', '08', '14', '25', '39'],
}));

beforeEach(() => {
  window.sessionStorage.clear();
  vi.mocked(lotteryApi.fetchLotteryHistory).mockResolvedValue(records);
  vi.mocked(lotteryApi.fetchLotteryHistoryYears).mockResolvedValue(['2026']);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test.each(['目前頁面', '舊版路由'])('%s切換紀錄頁碼後捲回頁面頂端', async (version) => {
  const view = version === '目前頁面'
    ? <FeaturePageRouter screen="history" onNavigate={vi.fn()} />
    : <DrawHistoryPage onNavigate={vi.fn()} />;
  const { container } = render(<div className="mobile-scroll">{view}</div>);
  const scroller = container.querySelector<HTMLElement>('.mobile-scroll')!;
  const pagination = await screen.findByRole('navigation', { name: '歷史開獎紀錄分頁' });

  const nextPage = within(pagination).getByRole('button', { name: '下一頁' });
  nextPage.focus();
  scroller.scrollTop = 900;
  fireEvent.click(nextPage, { detail: 0 });
  expect(pagination.textContent).toContain('2 / 2');
  expect(screen.getByText('11949')).toBeTruthy();
  expect(scroller.scrollTop).toBe(0);
  expect(document.activeElement).toBe(screen.getByLabelText('今彩539歷史開獎紀錄'));

  const previousPage = within(pagination).getByRole('button', { name: '上一頁' });
  previousPage.focus();
  scroller.scrollTop = 700;
  fireEvent.click(previousPage, { detail: 0 });
  expect(pagination.textContent).toContain('1 / 2');
  expect(screen.getByText('11999')).toBeTruthy();
  expect(scroller.scrollTop).toBe(0);
  expect(document.activeElement).toBe(screen.getByLabelText('今彩539歷史開獎紀錄'));
});
