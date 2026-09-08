// @vitest-environment jsdom
import { render } from '../../test/render-with-dialog';

import { screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { MatrixTiangongPage } from '../FeaturePages';

const matrixApi = vi.hoisted(() => ({
  fetchExploreList: vi.fn(), fetchExploreValidation: vi.fn(),
  fetchTianyanList: vi.fn(), fetchTianyanValidation: vi.fn(),
  fetchTiangongList: vi.fn(), fetchTiangongValidation: vi.fn(),
}));
vi.mock('../matrix-algorithm-api', () => matrixApi);

test('天工只保留一般與固定兩段探索設定', () => {
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);

  const generalCard = screen.getByRole('heading', { name: '探索設定' }).closest('section') as HTMLElement;
  const stageSection = screen.getByRole('heading', { name: '第一段 探索設定' }).closest('section') as HTMLElement;
  const firstStageCard = screen.getByRole('heading', { name: '第一段 探索設定' }).closest('.tiangong-stage-block') as HTMLElement;
  const generalPosition = within(generalCard!).getByRole('group', { name: '探索球位' });
  const firstPosition = within(firstStageCard!).getByRole('group', { name: '探索球位' });
  const firstRoad = within(firstStageCard!).getByRole('group', { name: '版路類型' });

  expect(within(generalCard!).getByText('彩球類型')).toBeTruthy();
  expect(within(generalPosition).getAllByRole('button').map((button) => button.textContent)).toEqual([
    '由左至右', '固定', '由右至左',
  ]);
  expect(within(firstPosition).getAllByRole('button').map((button) => button.textContent)).toEqual([
    '由左至右', '固定', '由右至左',
  ]);
  expect(firstRoad).toBeTruthy();
  expect(within(generalCard!).queryByRole('button', { name: '進階探索設定' })).toBeNull();
  expect(document.getElementById('tiangong-advanced-settings')).toBeNull();
  expect(screen.queryByText('探索模式')).toBeNull();
  expect(screen.queryByText('命中條件')).toBeNull();

  const secondTitle = screen.getByRole('heading', { name: '第二段 探索設定' });
  const secondBlock = secondTitle.closest('.tiangong-stage-block') as HTMLElement;
  expect(stageSection?.contains(secondTitle)).toBe(true);
  expect(secondBlock?.getAttribute('data-stage')).toBe('second');
  expect(within(secondBlock!).getByRole('group', { name: '探索球位' })).toBeTruthy();
  expect(within(secondBlock!).getByRole('group', { name: '版路類型' })).toBeTruthy();
});
