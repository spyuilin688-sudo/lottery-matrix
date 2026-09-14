import { updateAlgorithmCacheSession } from '../auth/algorithm-cache-scope';
import { invalidateMatrixData } from '../matrix-data-revision';
import type { Session } from '@supabase/supabase-js';
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render as renderWithoutDialog, screen, waitFor, within } from '@testing-library/react';
// @ts-expect-error Vitest runs on Node; app compilation intentionally omits global Node types.
import { readFileSync } from 'node:fs';
import { beforeEach, expect, test, vi } from 'vitest';
import { MatrixStatusPage } from '../FeaturePages';
import { AppDialogProvider } from '../dialog/AppDialog';
const render = (ui: Parameters<typeof renderWithoutDialog>[0]) => renderWithoutDialog(<AppDialogProvider>{ui}</AppDialogProvider>);

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
vi.mock('../lib/supabase', () => ({
  getSupabaseClient: () => ({ auth: {
    getSession: async () => ({ data: { session: { access_token: 'test', user: { app_metadata: { provider: 'custom:line' } } } }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  } }),
}));

declare const process: { cwd(): string };

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
  statusApi.listCustomStatusSettings.mockReset().mockResolvedValue({items:[],entitlements:{canCustomizeStatus:true,canUseCompositeCustomRoad:false}});
  statusApi.fetchMatrixStatus.mockReset().mockResolvedValue({
    kind: 'status', lottery: '今彩539', drawPeriod: '114000123', analysisVersion: 'v1:status',
    summary: { status: 'RESONANCE', count: 2, message: '具備強烈共振效應' },
    counts: { ACTIVE: 0, FOCUS: 0, RESONANCE: 2, CRITICAL: 0 },
    cards: [{
      id: 'card-one', ruleId: 'RESONANCE-1', status: 'RESONANCE', hitType: 'one-code', result: ['08'],
      sameCodeRoadCount: null, sameCodeRoadCountLocked: true,
      roads: [{
        id: 'road', locked: false, result: ['07', '09'], algorithmType: '加減', numberOrder: '依號碼由小到大排序',
        streak: 7, predictionDistance: 1, position: 1, lockedNumber: '05', explorePeriods: 2,
        validationItemId: 'source-road',
      }, { id: 'road-locked', locked: true, result: ['07', '09'], explorePeriods: 13 }],
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

test('狀態尚未回傳時顯示載入中，不把未知數量當成零或空結果', async () => {
  let finish!: (value: unknown) => void;
  statusApi.fetchMatrixStatus.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  render(<MatrixStatusPage onNavigate={vi.fn()} />);
  expect(screen.getByRole('status')).toHaveTextContent('資料載入中');
  expect(screen.queryByText('0 組')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /•啟動/ }));
  expect(screen.queryByText('尚無成立觸發')).toBeNull();
  await act(async () => finish({
    kind: 'status', lottery: '今彩539', drawPeriod: '115217', analysisVersion: 'v12:status',
    summary: { status: 'DORMANT', count: 0, message: '本期尚無符合條件的狀態。' },
    counts: { ACTIVE: 0, FOCUS: 0, RESONANCE: 0, CRITICAL: 0 }, cards: [], customTriggers: [], detailLocked: true,
  }));
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getAllByText('0 組')).toHaveLength(4);
  fireEvent.click(screen.getByRole('button', { name: /•啟動/ }));
  expect(screen.getByText('尚無成立觸發')).toBeTruthy();
});

test('狀態讀取失敗不顯示零組，切換彩種後重新載入', async () => {
  statusApi.fetchMatrixStatus.mockRejectedValueOnce(new Error('offline'));
  render(<MatrixStatusPage onNavigate={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Matrix 狀態讀取失敗');
  expect(screen.queryByText('0 組')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /•啟動/ }));
  expect(screen.queryByText('尚無成立觸發')).toBeNull();
  fireEvent.click(screen.getByRole('radio', { name: '天天樂' }));
  expect(await screen.findByText('2 組')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('狀態頁各同碼群組以獨立結果框呈現，並各自顯示探索結果表頭', async () => {
  render(<MatrixStatusPage onNavigate={vi.fn()} />);
  await screen.findByText('2 組');
  fireEvent.click(screen.getByRole('button', { name: /•共振/ }));
  const roadRow = await screen.findByRole('button', { name: '展開版路 road' });
  expect(roadRow).toHaveTextContent('順球1');
  expect(screen.getByText('05')).toBeTruthy();
  expect(roadRow.children[4]).toHaveTextContent('07.09');
  expect(screen.getByText('2 組')).toBeTruthy();
  const resultTable = screen.getByTestId('matrix-status-trigger-table');
  const resultGroups = screen.getAllByTestId('matrix-status-trigger-group');
  expect(resultGroups).toHaveLength(2);
  const firstGroup = resultGroups[0];
  expect(within(firstGroup).queryByText('單碼結果')).not.toBeInTheDocument();
  expect(within(firstGroup).getByText('結果：')).toBeInTheDocument();
  expect(within(firstGroup).queryByText('共振')).not.toBeInTheDocument();
  const lockedRow = firstGroup.querySelector('.matrix-status-locked-road .road-result-row');
  expect(lockedRow?.children).toHaveLength(2);
  expect(lockedRow?.children[0]).toHaveTextContent('🔒 Matrix Pro');
  expect(lockedRow?.children[1]).toHaveTextContent('07.09');
  expect(resultTable).toContainElement(firstGroup);
  for (const group of resultGroups) {
    for (const heading of ['位置', '號碼', '結果期', '連準次數', '結果', '版路類型']) {
      expect(within(group).getByText(heading)).toBeInTheDocument();
    }
  }
  expect(screen.queryByText('成立次數')).not.toBeInTheDocument();
  expect(screen.queryByText(/A 類型|B 類型|C 類型|D 類型/)).not.toBeInTheDocument();
  expect(screen.queryByText('24')).toBeNull();
  expect(statusApi.fetchMatrixStatus).toHaveBeenCalledWith('今彩539');
});

test('版路列可點擊展開，且只在展開已授權版路時讀取驗證過程', async () => {
  render(<MatrixStatusPage onNavigate={vi.fn()} />);
  await screen.findByText('2 組');
  fireEvent.click(screen.getByRole('button', { name: /•共振/ }));
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
  await screen.findByText('2 組');
  expect(screen.getByRole('button', { name: /•共振/ })).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('button', { name: /•共振/ }));
  expect(screen.getByRole('button', { name: /•共振/ })).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('radio', { name: '六合彩' }));
  expect(screen.getByRole('button', { name: /•共振/ })).toHaveAttribute('aria-expanded', 'false');
  await waitFor(() => expect(statusApi.fetchMatrixStatus).toHaveBeenCalledWith('六合彩'));
  await screen.findByText('2 組');
  expect(screen.getByRole('button', { name: /•共振/ })).toHaveAttribute('aria-expanded', 'false');
  const trigger = screen.getByRole('button', { name: '自訂觸發條件，連續點擊兩下開啟' });
  fireEvent.click(trigger, { detail: 1 });
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.click(trigger, { detail: 1 });
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('status-settings'));
});

test('自訂觸發條件位於頁首，與底部導覽分開', async () => {
  render(<MatrixStatusPage onNavigate={vi.fn()} />);
  await screen.findByText('2 組');
  const trigger = screen.getByRole('button', { name: '自訂觸發條件，連續點擊兩下開啟' });
  expect(trigger).toHaveClass('header-settings-button');
  expect(trigger.closest('header')).not.toBeNull();
  expect(trigger.closest('nav')).toBeNull();
  expect(trigger.querySelector('svg')).toBeInTheDocument();
  expect(screen.getByTestId('lottery-switcher')).toHaveClass('lottery-switcher--home-style');
});

for (const [code, message] of [
  ['AUTH_REQUIRED', '請先登入後再使用 自訂觸發條件'],
  ['FORBIDDEN', '目前 Matrix Pro 方案不符合自訂觸發條件的使用權限'],
] as const) {
  test(`自訂入口遇到 ${code} 留在狀態頁並跳出提醒`, async () => {
    statusApi.listCustomStatusSettings.mockRejectedValueOnce(Object.assign(new Error(code), {code}));
    const navigate = vi.fn();
    render(<MatrixStatusPage onNavigate={navigate} />);
    const trigger = screen.getByRole('button', {name:'自訂觸發條件，連續點擊兩下開啟'});
    trigger.focus();
    fireEvent.click(trigger, {detail:1}); fireEvent.click(trigger, {detail:1});
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(message);
    expect(navigate).not.toHaveBeenCalled();
    expect(document.querySelector('.custom-status-access-notice')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', {name:'知道了'}));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(navigate).not.toHaveBeenCalled();
  });
}

test('自訂入口依伺服器權限攔截，不因已登入就開放編輯', async () => {
  statusApi.listCustomStatusSettings.mockResolvedValueOnce({items:[],entitlements:{canCustomizeStatus:false}});
  const navigate=vi.fn(); render(<MatrixStatusPage onNavigate={navigate}/>);
  fireEvent.click(screen.getByRole('button',{name:'自訂觸發條件，連續點擊兩下開啟'}));
  expect(await screen.findByRole('dialog')).toHaveTextContent('目前 Matrix Pro 方案不符合自訂觸發條件的使用權限');
  expect(navigate).not.toHaveBeenCalled();
});

test('自訂入口檢查完成前不換頁、不重複請求，通過後才進入', async () => {
  let finish!: (value:unknown)=>void;
  statusApi.listCustomStatusSettings.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
  const navigate=vi.fn(); render(<MatrixStatusPage onNavigate={navigate}/>);
  const trigger=screen.getByRole('button',{name:'自訂觸發條件，連續點擊兩下開啟'});
  fireEvent.click(trigger); fireEvent.click(trigger);
  await waitFor(() => expect(trigger).toHaveAttribute('aria-busy','true'));
  expect(trigger).toHaveAttribute('aria-disabled','true');
  expect(trigger).not.toBeDisabled();
  expect(navigate).not.toHaveBeenCalled();
  expect(statusApi.listCustomStatusSettings).toHaveBeenCalledTimes(1);
  await act(async()=>finish({items:[],entitlements:{canCustomizeStatus:true}}));
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith('status-settings');
});

test('離開狀態頁後遲到的入口檢查結果不再換頁', async () => {
  let finish!: (value:unknown)=>void;
  statusApi.listCustomStatusSettings.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
  const navigate=vi.fn(); const {unmount}=render(<MatrixStatusPage onNavigate={navigate}/>);
  fireEvent.click(screen.getByRole('button',{name:'自訂觸發條件，連續點擊兩下開啟'}));
  await waitFor(() => expect(statusApi.listCustomStatusSettings).toHaveBeenCalled());
  unmount();
  await act(async()=>finish({items:[],entitlements:{canCustomizeStatus:true}}));
  expect(navigate).not.toHaveBeenCalled();
});

test('入口讀取失敗留在原頁，關閉提醒後可以重試', async () => {
  statusApi.listCustomStatusSettings.mockRejectedValueOnce(new Error('offline'));
  const navigate=vi.fn(); render(<MatrixStatusPage onNavigate={navigate}/>);
  fireEvent.click(screen.getByRole('button',{name:'自訂觸發條件，連續點擊兩下開啟'}));
  const dialog=await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('自訂設定讀取失敗');
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button',{name:'知道了'}));
  const trigger=screen.getByRole('button',{name:'自訂觸發條件，連續點擊兩下開啟'});
  await waitFor(()=>expect(trigger).not.toBeDisabled());
  fireEvent.click(trigger);
  await waitFor(()=>expect(navigate).toHaveBeenCalledWith('status-settings'));
});



test.each(['session', 'data'])('狀態頁 %s 變更即清除已顯示內容並重取，忽略舊驗證', async kind => {
  updateAlgorithmCacheSession({ access_token: 'a', user: { id: 'a' } } as Session);
  render(<MatrixStatusPage onNavigate={vi.fn()} />);
  await screen.findByText('2 組');
  fireEvent.click(screen.getByRole('button', { name: /•共振/ }));
  let resolve!: (value: unknown) => void;
  statusApi.fetchMatrixStatusValidation.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  fireEvent.click(screen.getByRole('button', { name: '展開版路 road' }));
  statusApi.fetchMatrixStatus.mockReturnValueOnce(new Promise(() => {}));
  act(() => kind === 'session'
    ? updateAlgorithmCacheSession({ access_token: 'b', user: { id: 'b' } } as Session)
    : invalidateMatrixData());
  expect(screen.queryByText('2 組')).toBeNull();
  expect(screen.queryByRole('button', { name: '展開版路 road' })).toBeNull();
  expect(statusApi.fetchMatrixStatus).toHaveBeenCalledTimes(2);
  await act(async () => resolve({ validation: { itemId: 'source-road', ruleSets: [] } }));
  expect(screen.queryByRole('region', { name: '版路驗證過程' })).toBeNull();
});

test('狀態頁忽略切換帳號前尚未完成的列表', async () => {
  updateAlgorithmCacheSession({ access_token: 'a', user: { id: 'a' } } as Session);
  const oldResponse = await statusApi.fetchMatrixStatus();
  statusApi.fetchMatrixStatus.mockClear();
  let resolve!: (value: unknown) => void;
  statusApi.fetchMatrixStatus.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  render(<MatrixStatusPage onNavigate={vi.fn()} />);
  statusApi.fetchMatrixStatus.mockRejectedValueOnce(new Error('offline'));
  act(() => updateAlgorithmCacheSession(null));
  await screen.findByRole('alert');
  await act(async () => resolve(oldResponse));
  expect(screen.queryByText('2 組')).toBeNull();
});
