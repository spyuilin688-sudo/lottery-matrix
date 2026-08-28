// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { MatrixTiangongPage } from '../FeaturePages';

const matrixApi = vi.hoisted(() => ({
  fetchExploreList: vi.fn(), fetchExploreValidation: vi.fn(),
  fetchTianyanList: vi.fn(), fetchTianyanValidation: vi.fn(),
  fetchTiangongList: vi.fn(), fetchTiangongValidation: vi.fn(),
}));
vi.mock('../matrix-algorithm-api', () => matrixApi);

test('天工將第一段設定放在第二張卡片，二段式在同卡片顯示第二段設定', () => {
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);

  const generalCard = screen.getByRole('heading', { name: '探索設定' }).closest('section');
  const stageCard = screen.getByRole('heading', { name: '第一段探索設定' }).closest('section');
  const firstPosition = screen.getByRole('group', { name: '第一段球位' });
  const firstRoad = screen.getByRole('group', { name: '第一段版路類型' });

  expect(generalCard).toBeTruthy();
  expect(stageCard).toBeTruthy();
  expect(generalCard).not.toBe(stageCard);
  expect(generalCard?.contains(firstPosition)).toBe(false);
  expect(generalCard?.contains(firstRoad)).toBe(false);
  expect(stageCard?.contains(firstPosition)).toBe(true);
  expect(stageCard?.contains(firstRoad)).toBe(true);
  expect(screen.queryByRole('heading', { name: '第二段探索設定' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: '二段式' }));

  const secondTitle = screen.getByRole('heading', { name: '第二段探索設定' });
  expect(stageCard?.contains(secondTitle)).toBe(true);
  expect(stageCard?.contains(screen.getByRole('group', { name: '第二段球位' }))).toBe(true);
  expect(stageCard?.contains(screen.getByRole('group', { name: '第二段版路類型' }))).toBe(true);
});
