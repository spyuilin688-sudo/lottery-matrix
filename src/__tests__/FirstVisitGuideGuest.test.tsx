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

test('免費模式首次使用教學明確說明查詢不需登入且不導向我的', async () => {
  window.localStorage.removeItem(FIRST_VISIT_GUIDE_SEEN_KEY);
  window.history.replaceState({}, '', '/');
  const onNavigate = vi.fn();

  render(<FirstVisitGuide enabled onNavigate={onNavigate} />);

  const dialog = await screen.findByRole('dialog', { name: '使用教學' });
  expect(dialog.textContent).toContain('不需 LINE 登入');
  const start = screen.getByRole('button', { name: '開始使用' });
  fireEvent.click(start);
  expect(onNavigate).not.toHaveBeenCalled();
});