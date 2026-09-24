// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { LotteryTabs } from '../features/shared';

afterEach(() => vi.restoreAllMocks());

test('彩種記憶不可讀寫時仍可使用彩種切換', () => {
  vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new DOMException('Storage denied', 'SecurityError'); });
  const onChange = vi.fn();
  render(<LotteryTabs selected="今彩539" onChange={onChange} />);

  expect(screen.getByRole('tab', { name: '今彩539' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('tab', { name: '大樂透' }));
  expect(screen.getByRole('tab', { name: '大樂透' })).toHaveAttribute('aria-selected', 'true');
  expect(onChange).toHaveBeenCalledWith('大樂透');
});
