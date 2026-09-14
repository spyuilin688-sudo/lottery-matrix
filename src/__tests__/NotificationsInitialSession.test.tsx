// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { normalizeMemberNotificationSettings } from '../../backend/member-notification-settings';

vi.mock('../member-api', () => ({
  fetchNotificationSettings: vi.fn(),
  hasAuthenticatedMemberSession: vi.fn().mockResolvedValue(true),
  saveNotificationSettings: vi.fn(),
}));
vi.mock('../push-subscription', async original => ({
  ...await original<typeof import('../push-subscription')>(),
  getPushStatus: vi.fn().mockResolvedValue({ supported: true, permission: 'default', enabled: false }),
}));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

it.each(['before settings', 'after settings'] as const)('loads settings when the auth bridge first initializes %s resolve', async timing => {
  const { updateAlgorithmCacheSession } = await import('../auth/algorithm-cache-scope');
  const { fetchNotificationSettings } = await import('../member-api');
  const { NotificationsPagePatched } = await import('../NotificationsPagePatched');
  const stored = normalizeMemberNotificationSettings({});
  stored.settings.bet = false;
  vi.mocked(fetchNotificationSettings).mockResolvedValue(stored);
  render(<NotificationsPagePatched onNavigate={vi.fn()} />);
  if (timing === 'after settings') await screen.findByRole('button', { name: '開啟選號提醒' });
  act(() => updateAlgorithmCacheSession({ access_token: 'first-session', user: { id: 'member' } } as Session));
  await waitFor(() => expect(fetchNotificationSettings).toHaveBeenCalledTimes(timing === 'after settings' ? 2 : 1));
  const row = document.querySelector<HTMLElement>('[data-notification-key="bet"]')!;
  expect(await within(row).findByRole('button', { name: '開啟選號提醒' })).toHaveAttribute('data-checked', 'false');
  expect(screen.getByRole('button', { name: '全部關閉' })).toBeEnabled();
});
