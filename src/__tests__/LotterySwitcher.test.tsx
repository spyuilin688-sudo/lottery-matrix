// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { LotterySwitcher, type LotteryId } from '../Prototype';

test('彩種選擇器以單一 Tab 入口操作，方向鍵循環切換並同步焦點與選中狀態', () => {
  function Selector() {
    const [selected, setSelected] = useState<LotteryId>('今彩539');
    return <LotterySwitcher selected={selected} onChange={setSelected} className="lottery-switcher--home-style" />;
  }
  render(<Selector />);
  const radios = screen.getAllByRole('radio');
  expect(radios.map(r => r.tabIndex)).toEqual([0, -1, -1, -1]);
  radios[0].focus();
  fireEvent.keyDown(radios[0], { key: 'ArrowLeft' });
  expect(radios[3]).toHaveFocus();
  expect(radios[3]).toHaveAttribute('aria-checked', 'true');
  fireEvent.keyDown(radios[3], { key: 'ArrowRight' });
  expect(radios[0]).toHaveFocus();
  fireEvent.keyDown(radios[0], { key: 'End' });
  expect(radios[3]).toHaveFocus();
  fireEvent.keyDown(radios[3], { key: 'Home' });
  expect(radios[0]).toHaveFocus();
  fireEvent.click(radios[2]);
  expect(radios.map(r => r.tabIndex)).toEqual([-1, -1, 0, -1]);
  expect(screen.getByRole('radio', { name: '六合彩' })).toHaveAttribute('aria-checked', 'true');
});
