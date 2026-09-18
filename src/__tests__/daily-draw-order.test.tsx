// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { LatestDrawCard } from '../Prototype';
import { FeaturePageRouter } from '../FeaturePagesCore';
import { AppDialogProvider } from '../dialog/AppDialog';
import type { ScreenId } from '../features/navigation';
import type { LotteryId } from '../Prototype';

const api = vi.hoisted(() => ({
  fetchLotteryHistory: vi.fn(), fetchLotteryHistoryYears: vi.fn(),
  fetchTongXing: vi.fn(), fetchNumberReference: vi.fn(), fetchMatrixCardManifest: vi.fn(),
  fetchExploreList: vi.fn(), fetchTianhengList: vi.fn(), fetchTianyanList: vi.fn(),
}));
vi.mock('../lottery-api', async importOriginal => ({
  ...await importOriginal<typeof import('../lottery-api')>(),
  fetchLotteryHistory: api.fetchLotteryHistory,
  fetchLotteryHistoryYears: api.fetchLotteryHistoryYears,
  fetchTongXing: api.fetchTongXing,
  fetchNumberReference: api.fetchNumberReference,
  fetchMatrixCardManifest: api.fetchMatrixCardManifest,
}));
vi.mock('../matrix-algorithm-api', async importOriginal => ({
  ...await importOriginal<typeof import('../matrix-algorithm-api')>(),
  fetchExploreList: api.fetchExploreList,
  fetchTianhengList: api.fetchTianhengList,
  fetchTianyanList: api.fetchTianyanList,
}));
vi.mock('../permission-settings', () => ({
  usePermissionSettings: () => ({ subscriptionPurchaseVisible: false, registeredMemberFreeAccess: true, revision: 1 }),
}));
vi.mock('../member-api', async importOriginal => ({
  ...await importOriginal<typeof import('../member-api')>(),
  bootstrapMember: vi.fn().mockResolvedValue(undefined),
  fetchMemberProfile: vi.fn().mockResolvedValue({
    exploreEntitlements: { canUseSeven: true, canUseThirteen: true, canUseFullRange: true },
  }),
}));

const sortedOrder = '依號碼由小到大排序';
const actualOrder = '依實際開獎順序排序';
const sorted = ['01', '08', '14', '25', '39'];
const actual = ['25', '01', '39', '08', '14'];
const record = { period: '11998', drawDate: '2026/09/13', numbers: sorted, sortedNumbers: sorted, drawOrderNumbers: actual };
const flush = () => act(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  api.fetchLotteryHistory.mockResolvedValue([record]);
  api.fetchLotteryHistoryYears.mockResolvedValue(['2026']);
  api.fetchTongXing.mockImplementation(async input => ({ ...input, groups: [] }));
  api.fetchNumberReference.mockImplementation(async input => ({ ...input, items: [{ ...record, matchSlots: [0, 0, 0, 0, 0] }] }));
  api.fetchMatrixCardManifest.mockImplementation(async lottery => ({
    lottery, period: '11998', cards: {
      sorted: { url: `/cards/${lottery}/11998/sorted.png` },
      draw: { url: `/cards/${lottery}/11998/draw.png` },
    },
  }));
  for (const [kind, fetcher] of [['explore', api.fetchExploreList], ['tianheng', api.fetchTianhengList], ['tianyan', api.fetchTianyanList]] as const) {
    fetcher.mockImplementation(async input => ({
      kind, lottery: input.lottery, drawPeriod: '11998', analysisVersion: 'test-v1',
      status: 'complete', items: [], duplicateStats: [], total: 0,
    }));
  }
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear(); });

async function openPage(page: ScreenId) {
  render(<AppDialogProvider><FeaturePageRouter screen={page} onNavigate={vi.fn()} /></AppDialogProvider>);
  await flush();
  if (['explore', 'tianheng', 'tianyan'].includes(page)) {
    fireEvent.click(screen.getByRole('button', { name: /^進階.*設定$/ }));
  }
}

function chooseLottery(lottery: LotteryId) {
  const select = screen.queryByRole('combobox', { name: '彩種' });
  if (select) fireEvent.change(select, { target: { value: lottery } });
  else fireEvent.click(screen.getByRole('tab', { name: lottery }));
}

test.each(['tongxing', 'reference', 'history', 'explore', 'tianheng', 'tianyan'] as const)(
  '%s disables actual order for daily and resets the selected order while other lotteries stay selectable',
  async page => {
    await openPage(page);
    const order = screen.getByRole('combobox', { name: '號碼順序' });
    fireEvent.change(order, { target: { value: actualOrder } });
    expect(order).toHaveValue(actualOrder);
    chooseLottery('天天樂');
    expect(within(order).getByRole('option', { name: actualOrder })).toBeDisabled();
    expect(order).toHaveValue(sortedOrder);
    // Even a stale/programmatic change cannot put an unavailable value back into the query.
    fireEvent.change(order, { target: { value: actualOrder } });
    expect(order).toHaveValue(sortedOrder);
    for (const lottery of ['今彩539', '六合彩', '大樂透'] as const) {
      chooseLottery(lottery);
      expect(within(order).getByRole('option', { name: actualOrder })).toBeEnabled();
      fireEvent.change(order, { target: { value: actualOrder } });
      expect(order).toHaveValue(actualOrder);
    }
    await flush();
  },
);

test.each(['tongxing', 'reference', 'history'] as const)('%s recovers a cached daily actual-order selection before displaying data', async page => {
  sessionStorage.setItem(`matrix-quick:${page}-lottery`, JSON.stringify({ value: '天天樂', savedAt: Date.now() }));
  sessionStorage.setItem(`matrix-quick:${page}-order`, JSON.stringify({ value: actualOrder, savedAt: Date.now() }));
  await openPage(page);
  expect(screen.getByRole('combobox', { name: '號碼順序' })).toHaveValue(sortedOrder);
  expect(JSON.parse(sessionStorage.getItem(`matrix-quick:${page}-order`)!).value).toBe(sortedOrder);
  if (page === 'history') {
    expect([...document.querySelectorAll('.draw-history-row:not(.history-head) .number-ball')].map(node => node.textContent)).toEqual(sorted);
  }
  if (page === 'reference') expect(screen.getByRole('heading', { name: `天天樂（${sortedOrder}）` })).toBeVisible();
});

test.each(['tongxing', 'reference', 'explore', 'tianheng', 'tianyan'] as const)('%s submits only sorted order after changing to daily', async page => {
  await openPage(page);
  fireEvent.change(screen.getByRole('combobox', { name: '號碼順序' }), { target: { value: actualOrder } });
  chooseLottery('天天樂');
  if (page === 'tongxing') {
    fireEvent.change(screen.getByRole('textbox', { name: '號碼 1' }), { target: { value: '01' } });
    fireEvent.change(screen.getByRole('textbox', { name: '號碼 2' }), { target: { value: '08' } });
  }
  const button = page === 'tianheng' ? '開始天衡' : page === 'tianyan' ? '開始天衍' : '開始探索';
  fireEvent.click(screen.getByRole('button', { name: button }));
  await flush();
  const fetcher = { tongxing: api.fetchTongXing, reference: api.fetchNumberReference, explore: api.fetchExploreList, tianheng: api.fetchTianhengList, tianyan: api.fetchTianyanList }[page];
  expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ lottery: '天天樂', numberOrder: sortedOrder }));
});

test('history replaces the applied actual order immediately when the lottery changes to daily', async () => {
  await openPage('history');
  fireEvent.change(screen.getByRole('combobox', { name: '號碼順序' }), { target: { value: actualOrder } });
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  await flush();
  fireEvent.click(screen.getByRole('button', { name: '展開篩選設定' }));
  chooseLottery('天天樂');
  await flush();
  const list = screen.getByLabelText('天天樂歷史開獎號碼');
  expect([...list.querySelectorAll('.draw-history-row:not(.history-head) .number-ball')].map(node => node.textContent)).toEqual(sorted);
});

test('home disables actual order and renders sorted balls when the selected lottery becomes daily', () => {
  const onOrderChange = vi.fn();
  const props = { order: '落球' as const, onOrderChange, result: { issue: '11998', date: '2026/09/13', numbers: sorted, drawOrderNumbers: actual }, nextDrawInfo: { nextDraw: '', remainingTime: '' } };
  const view = render(<LatestDrawCard {...props} lottery="今彩539" />);
  expect(screen.getByRole('radio', { name: '落球' })).toBeEnabled();
  view.rerender(<LatestDrawCard {...props} lottery="天天樂" />);
  expect(screen.getByRole('radio', { name: '落球' })).toBeDisabled();
  expect(screen.getByRole('radio', { name: '順球' })).toHaveAttribute('aria-checked', 'true');
  expect([...document.querySelectorAll('.number-ball')].map(node => node.textContent)).toEqual(sorted);
  expect(onOrderChange).toHaveBeenCalledWith('順球');
  onOrderChange.mockClear();
  fireEvent.click(screen.getByRole('radio', { name: '落球' }));
  expect(onOrderChange).not.toHaveBeenCalled();
});

test('daily cards never enable an actual-order image even when an old manifest contains one', async () => {
  await openPage('matrix-card');
  fireEvent.click(screen.getByRole('tab', { name: '落球' }));
  expect(screen.getByRole('img', { name: '今彩539落球牌單，第 11998 期' })).toBeVisible();
  chooseLottery('天天樂');
  await flush();
  expect(screen.getByRole('tab', { name: '落球' })).toBeDisabled();
  expect(screen.getByRole('tab', { name: '順球' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('img', { name: '天天樂順球牌單，第 11998 期' })).toHaveAttribute('src', expect.stringContaining('/sorted.png'));
  expect(screen.queryByText('落球（待公布）')).not.toBeInTheDocument();
  chooseLottery('今彩539');
  await flush();
  expect(screen.getByRole('tab', { name: '落球' })).toBeEnabled();
});
