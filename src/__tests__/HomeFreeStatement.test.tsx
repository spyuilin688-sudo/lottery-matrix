// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { refreshPermissionSettings } from '../permission-settings';
import { HomeFreeStatement } from '../homepage/HomeFreeStatement';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ rpc }) }));
const lines = [
  '本站僅提供公開歷史數據查詢，不提供任何投注建議。',
  '本服務僅供學術參考研究使用，不保証數據之即時性與準確性。',
];
test('homepage statement follows the real purchase setting and preserves both exact paragraphs', async () => {
  let revision = 1;
  const toggle = async (visible: boolean, free: boolean) => {
    rpc.mockResolvedValue({ data: { subscriptionPurchaseVisible: visible, registeredMemberFreeAccess: free, revision: revision++, updatedAt: '2026-09-10T00:00:00Z' }, error: null });
    await act(async () => { await refreshPermissionSettings(); });
  };
  await toggle(true, false);
  render(<HomeFreeStatement />);
  expect(screen.queryByLabelText('免費聲明')).toBeNull();
  for (const free of [false, true]) {
    await toggle(false, free);
    expect([...screen.getByLabelText('免費聲明').querySelectorAll('p')].map(p => p.textContent)).toEqual(lines);
    await toggle(true, free);
    expect(screen.queryByLabelText('免費聲明')).toBeNull();
  }
});
