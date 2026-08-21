// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { MatrixStatusSection } from '../Prototype';

test('首頁狀態卡直接顯示目前 API 觸發狀態與組數', () => {
  render(<MatrixStatusSection current={{ status: 'CRITICAL', count: 2, message: '極為罕見版路狀態' }} />);
  const section = screen.getByTestId('matrix-status-section');
  expect(section.getAttribute('data-current-status')).toBe('CRITICAL');
  expect(screen.getByText('臨界')).toBeTruthy();
  expect(screen.getByText('2 組')).toBeTruthy();
  expect(screen.getByText('極為罕見版路狀態')).toBeTruthy();
});

test('無觸發時顯示沉寂而不是固定範例', () => {
  render(<MatrixStatusSection current={{ status: 'DORMANT', count: 0, message: '本期尚無符合條件的狀態。' }} />);
  expect(screen.getByText('沉寂')).toBeTruthy();
  expect(screen.getByText('本期尚無符合條件的狀態。')).toBeTruthy();
});
