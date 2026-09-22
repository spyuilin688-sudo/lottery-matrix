// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { render } from '../../test/render-with-dialog';
import { FIRST_VISIT_GUIDE_SEEN_KEY, FirstVisitGuide } from '../onboarding/FirstVisitGuide';

vi.mock('../subscription-purchase-visibility', () => ({
  useSubscriptionPurchaseVisible: () => false,
}));

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(FIRST_VISIT_GUIDE_SEEN_KEY);
  window.history.replaceState({}, '', '/');
});

test('免費模式教學區分訪客基本查詢與 LINE 新會員 48 小時權限', async () => {
  window.localStorage.removeItem(FIRST_VISIT_GUIDE_SEEN_KEY);
  window.history.replaceState({}, '', '/');
  const onNavigate = vi.fn();

  render(<FirstVisitGuide enabled onNavigate={onNavigate} />);

  const dialog = await screen.findByRole('dialog', { name: '使用教學' });
  expect(dialog.textContent).toContain('探索二期、天衡三期基本查詢可直接使用');
  expect(dialog.textContent).toContain('新註冊 LINE 會員可於註冊後 48 小時內使用 Matrix 探索、天衡、天樞十三期及完整範圍');
  expect(dialog.textContent).not.toContain('天衍 2 天');
  expect(dialog.textContent).not.toContain('天工 1 天');
  const start = screen.getByRole('button', { name: '開始使用' });
  fireEvent.click(start);
  expect(onNavigate).not.toHaveBeenCalled();
});