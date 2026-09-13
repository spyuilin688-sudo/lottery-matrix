// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { MatrixStatusTriggerCard } from '../features/MatrixStatusPages';
import { AppDialogProvider } from '../dialog/AppDialog';
import { MatrixExplorePage } from '../features/MatrixExplorePage';
import { MatrixTiangongPage, TiangongValidationProcess } from '../features/MatrixTiangongPage';
import { ExploreValidationProcess, TianyanValidationProcess, TianhengValidationProcess } from '../features/MatrixValidation';
import type { ExploreValidation, TianyanValidation, TiangongValidation } from '../matrix-algorithm-api';

const settings = vi.hoisted(() => ({ visible: true, listeners: new Set<() => void>() }));
vi.mock('../subscription-purchase-visibility', async () => {
  const { useSyncExternalStore } = await import('react');
  return { useSubscriptionPurchaseVisible: () => useSyncExternalStore(
    listener => { settings.listeners.add(listener); return () => { settings.listeners.delete(listener); }; }, () => settings.visible,
  ) };
});
vi.mock('../member-api', () => ({ bootstrapMember: async () => ({}), fetchMemberProfile: async () => null }));
vi.mock('../matrix-algorithm-api', () => {
  const result = { items: [], total: 0, duplicateStats: [], kind: 'explore', lottery: '今彩539', status: 'complete', drawPeriod: '114123', analysisVersion: 'v1' };
  return { fetchExploreList: async () => result, fetchTianhengList: async () => ({ ...result, kind: 'tianheng' }), fetchTianyanList: async () => ({ ...result, kind: 'tianyan' }), fetchTiangongList: async () => ({ ...result, kind: 'tiangong' }) };
});
const toggle = (visible: boolean) => act(() => { settings.visible = visible; settings.listeners.forEach(listener => listener()); });
beforeEach(() => {
  settings.visible = true;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [] }) }));
});

test.each(['Matrix 探索', 'Matrix 天衡', 'Matrix 天衍', 'Matrix 天工'] as const)('%s result headings stay consistent in both visibility modes without changing columns', async title => {
  const Page = title === 'Matrix 天工' ? <MatrixTiangongPage onNavigate={vi.fn()} /> : <MatrixExplorePage title={title} onNavigate={vi.fn()} />;
  const view = render(<AppDialogProvider>{Page}</AppDialogProvider>);
  fireEvent.click(screen.getByRole('button', { name: title === 'Matrix 探索' ? '開始探索' : title === 'Matrix 天衡' ? '開始天衡' : title === 'Matrix 天衍' ? '開始天衍' : '開始天工' }));
  await act(async () => {});
  const head = view.container.querySelector('.road-results-head')!;
  const original = head.textContent;
  const columns = head.children.length;
  expect(original).toContain('結果');
  expect(original).not.toMatch(/預測|查詢期|查詢位置/);
  toggle(false);
  expect(head.textContent).toContain('結果');
  expect(head.textContent).not.toContain('預測期');
  if (title !== 'Matrix 天工') expect(head.textContent).toContain('結果期');
  else { expect(head.textContent).toContain('結果位置'); expect(head.textContent).not.toContain('預測位置'); }
  expect(head.children.length).toBe(columns);
  toggle(true);
  expect(head.textContent).toBe(original);
});

const explore: ExploreValidation = {
  itemId: 'result-1', ruleSets: [{ rules: [{ value: 8, display: '+8', algorithmType: '加減' }], predictionNumbers: [22], historicalValidation: [] }],
};
const tianyan: TianyanValidation = {
  itemId: 'result-2', rules: [], groupCount: 0, minimumIndependentHits: 0, rule1Only: 0, rule2Only: 0, bothHit: 0,
  mergedSearchPredictionNumbers: ['22'], historicalValidation: [],
};
const tiangong: TiangongValidation = {
  itemId: 'result-3', evidence: { rows: [{ group: 'A', role: 'prediction', source: { period: '114123', position: 1, number: '14' },
    stage1: { period: '114124', position: 1, calculated_number: '18', actual_number: null, matched: null },
    stage2: { period: '114125', position: 1, calculated_number: '22', actual_number: null, matched: null },
  }], d_exclusion: { status: 'excluded' } },
};

test.each(['探索', '天衍', '天工'] as const)('%s expanded footer retains its result label and numbers in both visibility modes', name => {
  const item = { number: '14', position: 1, predictionPeriod: 2, consecutive: '準5進6', algorithmType: '加減' };
  const view = render(name === '探索' ? <ExploreValidationProcess item={item} lottery="今彩539" validation={explore} loading={false} />
    : name === '天衍' ? <TianyanValidationProcess item={item} lottery="今彩539" validation={tianyan} loading={false} />
      : <TiangongValidationProcess validation={tiangong} loading={false} />);
  const footer = view.container.querySelector('.explore-validation-prediction')!;
  const original = footer.textContent;
  expect(original).toContain('版路結果');
  expect(original).toContain('22');
  toggle(false);
  expect(footer.textContent).toBe(original);
  toggle(true);
  expect(footer.textContent).toBe(original);
});


test('expanded Matrix status uses the same result terms and numbers in both visibility modes', () => {
  const view = render(<MatrixStatusTriggerCard
    card={{ id: 'status-1', ruleId: 'rule-1', status: 'ACTIVE', hitType: 'one-code', result: ['07'], sameCodeRoadCount: 1, sameCodeRoadCountLocked: false, roads: [] }}
    showColumnHead lottery="今彩539" analysisVersion="v1" expandedRoad={null}
    validationById={{}} validationLoadingId={null} validationErrorId={null} onToggleRoad={vi.fn()}
  />);
  const result = view.container.querySelector('.matrix-status-trigger-result')!;
  const head = view.container.querySelector('.road-results-head')!;
  const originalHead = head.textContent;
  const columns = head.children.length;
  expect(originalHead).toContain('結果期');
  const original = result.textContent;
  expect(original).toBe('結果：07');
  toggle(false);
  expect(result.textContent).toBe('結果：07');
  expect(head.textContent).toContain('結果期');
  expect(head.textContent).toContain('結果');
  expect(head.textContent).not.toContain('預測');
  expect(head.children.length).toBe(columns);
  toggle(true);
  expect(result.textContent).toBe(original);
  expect(head.textContent).toBe(originalHead);
});


test.each([true, false])('天衡展開末列在購買顯示 %s 下維持版路結果及結果號碼', visible => {
  settings.visible = visible;
  const item = { id: 'th-1', firstNumber: '08', firstLockedPosition: 2, secondNumber: '17', secondLockedPosition: 4,
    predictionDistance: 3, consecutive: '準5進6', highestStreak: 5, predictionNumbers: ['22'], algorithmType: '加減',
    numberOrder: '依號碼由小到大排序', explorePeriods: 3, exploreDateOffset: 0, ruleCount: 1 } as const;
  const view = render(<TianhengValidationProcess item={{ ...item, predictionNumbers: [...item.predictionNumbers] }} lottery="今彩539"
    validation={{ itemId: 'th-1', ruleSets: [{ rules: [{ value: 8, display: '+8', algorithmType: '加減' }], predictionNumbers: [22], historicalValidation: [] }] }} loading={false} />);
  const footer = view.container.querySelector('.explore-validation-prediction')!;
  expect(footer).toHaveTextContent('版路結果22');
  expect(footer).not.toHaveTextContent('本期預測');
});
