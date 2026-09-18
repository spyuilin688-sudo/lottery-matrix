// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import {
  MATRIX_STATUS_BY_LOTTERY,
  MatrixStatusSection,
  type MatrixStatusMap,
} from '../Prototype';

test('首頁狀態卡依指定位置顯示四個固定彩種與沉寂預設狀態', () => {
  render(<MatrixStatusSection />);

  const section = screen.getByTestId('matrix-status-section');
  const cards = within(section).getAllByRole('button');
  expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
    '今彩539 沉寂',
    '天天樂 沉寂',
    '六合彩 沉寂',
    '大樂透 沉寂',
  ]);

  const artworks = Array.from(section.querySelectorAll<HTMLImageElement>('.matrix-status-artwork'));
  expect(artworks.map((image) => image.getAttribute('src'))).toEqual([
    '/assets/lottery/status/沉寂.png',
    '/assets/lottery/status/沉寂.png',
    '/assets/lottery/status/沉寂.png',
    '/assets/lottery/status/沉寂.png',
  ]);

  const logos = Array.from(section.querySelectorAll<HTMLImageElement>('.matrix-status-lottery-logo'));
  expect(logos.map((image) => image.getAttribute('alt'))).toEqual([
    '今彩539',
    '天天樂',
    '六合彩',
    '大樂透',
  ]);
  expect(section.querySelector('img[src*="matrixAA.png"]')).toBeNull();
  expect(section.querySelector('.clean-hit-label')).toBeNull();
});

test('未觸發的彩種可切換為沉寂圖片', () => {
  const statuses: MatrixStatusMap = {
    ...MATRIX_STATUS_BY_LOTTERY,
    今彩539: {
      ...MATRIX_STATUS_BY_LOTTERY.今彩539,
      status: '沉寂',
      statusEn: 'DORMANT',
      artwork: '/assets/lottery/status/沉寂.png',
      count: 0,
      description: '',
      tone: 'dormant',
    },
  };

  render(<MatrixStatusSection statuses={statuses} />);
  const dormantCard = screen.getByRole('button', { name: '今彩539 沉寂' });
  expect(dormantCard.getAttribute('data-status')).toBe('DORMANT');
  expect(dormantCard.querySelector('.matrix-status-artwork')?.getAttribute('src')).toBe(
    '/assets/lottery/status/沉寂.png',
  );
});

test('點擊狀態卡會帶入該卡所屬彩種', () => {
  const onOpen = vi.fn();
  render(<MatrixStatusSection onOpen={onOpen} />);

  fireEvent.click(screen.getByRole('button', { name: '天天樂 沉寂' }));

  expect(onOpen).toHaveBeenCalledWith('天天樂');
});
