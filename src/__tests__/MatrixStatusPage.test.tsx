// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
// @ts-expect-error Vitest runs on Node; app compilation intentionally omits global Node types.
import { readFileSync } from 'node:fs';
import { beforeEach, expect, test, vi } from 'vitest';
import { MatrixStatusPage } from '../FeaturePages';

vi.mock('../Prototype', () => ({
  LotterySwitcher: ({ selected, onChange, className }: {
    selected: string;
    onChange(value: string): void;
    className?: string;
  }) => <div data-testid="lottery-switcher" className={className}>
    {['今彩539', '天天樂', '六合彩', '大樂透'].map((lottery) => <button
      type="button"
      role="radio"
      aria-checked={selected === lottery}
      aria-label={lottery}
      onClick={() => onChange(lottery)}
      key={lottery}
    >{lottery}</button>)}
  </div>,
}));
vi.mock('../auth/line-auth', () => ({
  signInWithLine: vi.fn(),
  signOutFromMatrix: vi.fn(),
}));

declare const process: { cwd(): string };

const featurePageAdjustmentsCss = readFileSync(`${process.cwd()}/src/feature-page-adjustments.css`, 'utf8');
const featurePagesCss = readFileSync(`${process.cwd()}/src/feature-pages.css`, 'utf8');

const statusApi = vi.hoisted(() => ({
  fetchMatrixStatus: vi.fn(), fetchMatrixStatusValidation: vi.fn(), listCustomStatusSettings: vi.fn(), saveCustomStatusSetting: vi.fn(), resetCustomStatusSetting: vi.fn(),
}));
vi.mock('../matrix-status-api', () => statusApi);
const algorithmApi = vi.hoisted(() => ({
  fetchExploreList: vi.fn(),
  fetchExploreValidation: vi.fn(),
  fetchTianyanList: vi.fn(),
  fetchTianyanValidation: vi.fn(),
  fetchTiangongList: vi.fn(),
  fetchTiangongValidation: vi.fn(),
}));
vi.mock('../matrix-algorithm-api', () => algorithmApi);

beforeEach(() => {
  cleanup();
  statusApi.fetchMatrixStatus.mockReset().mockResolvedValue({
    kind: 'status', lottery: '今彩539', drawPeriod: '114000123', analysisVersion: 'v1:status',
    summary: { status: 'RESONANCE', count: 2, message: '具備強烈共振效應' },
    counts: { ACTIVE: 0, FOCUS: 0, RESONANCE: 2, CRITICAL: 0 },
    cards: [{
      id: 'card-one', ruleId: 'RESONANCE-1', status: 'RESONANCE', hitType: 'one-code', result: ['08'],
      sameCodeRoadCount: null, sameCodeRoadCountLocked: true,
      roads: [{
        id: 'road', locked: false, result: ['08'], algorithmType: '加減', numberOrder: '依號碼由小到大排序',
        streak: 7, predictionDistance: 1, position: 1, lockedNumber: '05', explorePeriods: 2,
        validationItemId: 'source-road',
      }, { id: 'road-locked', locked: true, result: ['08'], explorePeriods: 13 }],
    }, {
      id: 'card-two', ruleId: 'RESONANCE-4', status: 'RESONANCE', hitType: 'one-code', result: ['09'],
      sameCodeRoadCount: 1, sameCodeRoadCountLocked: false,
      roads: [{
        id: 'road-two', locked: false, result: ['09'], algorithmType: '拖牌', numberOrder: '依號碼由小到大排序',
        streak: 7, predictionDistance: 2, position: 2, lockedNumber: '06', explorePeriods: 2,
        validationItemId: 'source-road-two',
      }],
    }],
    customTriggers: [], detailLocked: false,
  });
  statusApi.fetchMatrixStatusValidation.mockReset().mockResolvedValue({
    kind: 'status-validation', lottery: '今彩539', drawPeriod: '114000123', analysisVersion: 'v1',
    status: 'complete', itemId: 'source-road', validation: { itemId: 'source-road', ruleSets: [] },
  });
});

test('狀態頁以單一結果框呈現所有同碼群組，並只顯示一份探索結果表頭', async () => {
  render(<MatrixStatusPage onNavigate={vi.fn()} />);
  const roadRow = await screen.findByRole('button', { name: '展開版路 road' });
  expect(roadRow).toHaveTextContent('順球1');
  expect(screen.getByText('05')).toBeTruthy();
  expect(screen.getAllByText('08').length).toBeGreaterThan(0);
  expect(screen.getByText('2 組')).toBeTruthy();
  const resultTable = screen.getByTestId('matrix-status-trigger-table');
  expect(screen.getAllByTestId('matrix-status-trigger-group')).toHaveLength(2);
  const firstGroup = screen.getAllByTestId('matrix-status-trigger-group')[0];
  expect(within(firstGroup).getByText('單碼結果')).toBeInTheDocument();
  expect(within(firstGroup).getByText('共振')).toBeInTheDocument();
  const lockedRow = firstGroup.querySelector('.matrix-status-locked-road .road-result-row');
  expect(lockedRow?.children).toHaveLength(6);
  for (const index of [0, 1, 2, 3, 5]) {
    expect(lockedRow?.children[index]).toHaveTextContent('🔒 Matrix Pro');
  }
  expect(lockedRow?.children[4]).toHaveTextContent('08');
  for (const heading of ['位置', '號碼', '預測期', '連準次數', '預測', '版路類型']) {
    expect(within(resultTable).getAllByText(heading)).toHaveLength(1);
  }
  expect(screen.queryByText('成立次數')).not.toBeInTheDocument();
  expect(screen.queryByText(/A 類型|B 類型|C 類型|D 類型/)).not.toBeInTheDocument();
  expect(screen.queryByText('24')).toBeNull();
  expect(statusApi.fetchMatrixStatus).toHaveBeenCalledWith('今彩539');
});

test('版路列可點擊展開，且只在展開已授權版路時讀取驗證過程', async () => {
  render(<MatrixStatusPage onNavigate={vi.fn()} />);
  const road = await screen.findByRole('button', { name: '展開版路 road' });
  expect(statusApi.fetchMatrixStatusValidation).not.toHaveBeenCalled();

  fireEvent.click(road);

  await waitFor(() => expect(statusApi.fetchMatrixStatusValidation).toHaveBeenCalledWith({
    lottery: '今彩539', drawPeriod: '114000123', analysisVersion: 'v1',
  }, 'source-road'));
  expect(await screen.findByText('無驗證資料')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /card-one:locked/ })).not.toBeInTheDocument();
});

test('狀態類別首列採用八像素間距，數量與狀態名稱同列且卡片保持緊湊', async () => {
  const { container } = render(<MatrixStatusPage onNavigate={vi.fn()} />);
  await screen.findByText('•臨界');
  const critical = container.querySelector('[data-status="CRITICAL"] .matrix-status-category-heading');
  expect(critical).toHaveTextContent('•臨界極為罕見版路狀態');
  expect(container.querySelector('[data-status="CRITICAL"] .matrix-status-category-count')).toHaveTextContent('0 組');
  const headingRule = featurePagesCss.match(/\.matrix-status-screen \.status-block > button \.matrix-status-category-heading\s*\{[^}]*\}/s)?.[0] ?? '';
  const buttonRule = featurePagesCss.match(/\.matrix-status-screen \.status-block > button\s*\{[^}]*\}/s)?.[0] ?? '';
  expect(headingRule).toMatch(/gap:\s*8px;/);
  expect(buttonRule).not.toMatch(/min-height:\s*70px;/);
});

test('切換彩種重新讀取狀態，且自訂觸發條件需連續點擊兩下才可進入', async () => {
  const navigate = vi.fn();
  render(<MatrixStatusPage onNavigate={navigate} />);
  fireEvent.click(screen.getByRole('radio', { name: '六合彩' }));
  await waitFor(() => expect(statusApi.fetchMatrixStatus).toHaveBeenCalledWith('六合彩'));
  const trigger = screen.getByRole('button', { name: '自訂觸發條件，連續點擊兩下開啟' });
  fireEvent.click(trigger, { detail: 1 });
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.click(trigger, { detail: 1 });
  expect(navigate).toHaveBeenCalledWith('status-settings');
});

test('自訂觸發條件入口移至底部導覽所在的 mobile-page 點擊層', async () => {
  const statusRule = featurePageAdjustmentsCss.match(/(?:\.matrix-status-screen\s+)?\.matrix-status-settings-entry\s*\{[^}]*\}/s)?.[0] ?? '';
  const mobilePage = document.createElement('section');
  mobilePage.className = 'mobile-page';
  document.body.appendChild(mobilePage);

  const { container, unmount } = render(<MatrixStatusPage onNavigate={vi.fn()} />);
  const trigger = screen.getByRole('button', { name: '自訂觸發條件，連續點擊兩下開啟' });

  expect(trigger).toHaveClass('bottom-navigation-quick-settings', 'matrix-status-settings-entry');
  expect(trigger.querySelector('.bottom-navigation-quick-settings-visual')).toBeInTheDocument();
  expect(trigger.querySelector('svg')).toBeInTheDocument();
  await waitFor(() => expect(mobilePage).toContainElement(trigger));
  expect(trigger.parentElement).toBe(mobilePage);
  expect(statusRule).toMatch(/^\.matrix-status-settings-entry\s*\{/);
  expect(statusRule).toMatch(/position:\s*fixed;/);
  expect(statusRule).toMatch(/z-index:\s*21;/);
  expect(statusRule).toMatch(/right:\s*max\(10px, calc\(env\(safe-area-inset-right, 0px\) \+ 4px\)\);/);
  expect(screen.queryByRole('img', { name: '自訂觸發條件' })).not.toBeInTheDocument();
  expect(container.querySelector('.matrix-title-banner-actions')).not.toBeInTheDocument();
  expect(screen.getByTestId('lottery-switcher')).toHaveClass('lottery-switcher--home-style');

  unmount();
  mobilePage.remove();
});
