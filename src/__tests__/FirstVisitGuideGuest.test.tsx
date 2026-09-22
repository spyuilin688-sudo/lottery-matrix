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

test('免費模式教學區分訪客基本查詢、登入功能與 LINE 專屬試用', async () => {
  window.localStorage.removeItem(FIRST_VISIT_GUIDE_SEEN_KEY);
  window.history.replaceState({}, '', '/');
  const onNavigate = vi.fn();

  render(<FirstVisitGuide enabled onNavigate={onNavigate} />);

  const dialog = await screen.findByRole('dialog', { name: '使用教學' });
  expect(dialog.textContent).toContain('探索二期、天衡三期基本查詢可直接使用');
  expect(dialog.textContent).toContain('較高期數、完整範圍、天衍與天工請先使用 LINE 或 Google 登入');
  expect(dialog.textContent).toContain('新註冊 LINE 會員');
  const start = screen.getByRole('button', { name: '開始使用' });
  fireEvent.click(start);
  expect(onNavigate).not.toHaveBeenCalled();
});