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

test('首次提示僅提供授權條款與單一同意按鈕', async () => {
  window.localStorage.removeItem(FIRST_VISIT_GUIDE_SEEN_KEY);
  window.history.replaceState({}, '', '/');
  const onNavigate = vi.fn();

  render(<FirstVisitGuide enabled onNavigate={onNavigate} />);

  const dialog = await screen.findByRole('dialog', { name: '【使用者授權條款與免責聲明】' });
  expect(dialog.textContent).toContain('歡迎使用 Matrix 數據分析系統。');
  expect(dialog.textContent).toContain('《隱私權政策》');
  const consent = screen.getByRole('button', { name: '同意條款並進入系統' });
  fireEvent.click(consent);
  expect(onNavigate).not.toHaveBeenCalled();
});
