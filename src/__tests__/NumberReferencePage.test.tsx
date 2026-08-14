// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { NumberReferencePage } from '../FeaturePages';

beforeEach(() => {
  window.localStorage.clear();
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ records: [] }),
  }) as typeof fetch;
  window.requestAnimationFrame = (callback) => {
    callback(0);
    return 1;
  };
});

test('從列表底部展開探索設定時將設定區移入可見畫面', () => {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  render(<NumberReferencePage onNavigate={vi.fn()} />);

  const toggle = screen.getByRole('button', { name: '收合探索設定' });
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole('button', { name: '展開探索設定' }));

  expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
});
