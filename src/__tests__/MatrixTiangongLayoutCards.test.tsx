// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { MatrixTiangongPage } from '../FeaturePages';

const matrixApi = vi.hoisted(() => ({
  fetchExploreList: vi.fn(), fetchExploreValidation: vi.fn(),
  fetchTianyanList: vi.fn(), fetchTianyanValidation: vi.fn(),
  fetchTiangongList: vi.fn(), fetchTiangongValidation: vi.fn(),
}));
vi.mock('../matrix-algorithm-api', () => matrixApi);

test('天工重排一般、進階與兩段探索設定', () => {
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);

  const generalCard = screen.getByRole('heading', { name: '探索設定' }).closest('section') as HTMLElement;
  const stageCard = screen.getByRole('heading', { name: '第一段 探索設定' }).closest('section') as HTMLElement;
  const generalPosition = within(generalCard!).getByRole('group', { name: '探索球位' });
  const firstPosition = within(stageCard!).getByRole('group', { name: '探索球位' });
  const firstRoad = within(stageCard!).getByRole('group', { name: '版路類型' });

  expect(within(generalCard!).getByText('彩球類型')).toBeTruthy();
  expect(within(generalPosition).getAllByRole('button').map((button) => button.textContent)).toEqual([
    '由左至右', '固定', '由右至左',
  ]);
  expect(within(firstPosition).getAllByRole('button').map((button) => button.textContent)).toEqual([
    '由左至右', '固定', '由右至左',
  ]);
  expect(firstRoad).toBeTruthy();
  const advancedSettings = within(generalCard!).getByRole('button', { name: '進階探索設定' });
  if (advancedSettings.getAttribute('aria-expanded') !== 'true') fireEvent.click(advancedSettings);

  const advancedPanel = document.getElementById('tiangong-advanced-settings') as HTMLElement;
  const modeButtons = within(advancedPanel).getAllByRole('button').filter((button) => ['一段式', '二段式'].includes(button.textContent ?? ''));
  expect(modeButtons.find((button) => button.textContent === '一段式')).toBeTruthy();
  expect(screen.getByText('準2進3')).toBeTruthy();

  fireEvent.click(modeButtons.find((button) => button.textContent === '二段式')!);

  const secondTitle = screen.getByRole('heading', { name: '第二段 探索設定' });
  const secondBlock = secondTitle.closest('.tiangong-stage-block') as HTMLElement;
  expect(stageCard?.contains(secondTitle)).toBe(true);
  expect(secondBlock?.getAttribute('data-stage')).toBe('second');
  expect(within(secondBlock!).getByRole('group', { name: '探索球位' })).toBeTruthy();
  expect(within(secondBlock!).getByRole('group', { name: '版路類型' })).toBeTruthy();
});
