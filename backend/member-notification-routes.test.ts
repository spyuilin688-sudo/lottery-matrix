import { describe, expect, it, vi } from 'vitest';
import { createDefaultMemberNotificationSettings } from './member-notification-settings';
import { createMemberNotificationRoutes } from './member-notification-routes';
import type { MemberContext } from './matrix-entitlements';

const member: MemberContext = {
  authUserId: 'user-1',
  memberId: 'member-1',
  plan: 'monthly',
  active: true,
  referralSuccessCount: 0,
};

describe('member notification routes', () => {
  it('returns current UI defaults when the member has no saved settings', async () => {
    const store = {
      read: vi.fn(async () => null),
      save: vi.fn(),
    };
    const api = createMemberNotificationRoutes({ requireMember: async () => member, store });

    await expect(api.get({ authorization: 'Bearer token', body: {} })).resolves.toEqual({
      status: 200,
      body: createDefaultMemberNotificationSettings(),
    });
    expect(store.read).toHaveBeenCalledWith('member-1');
  });

  it('saves settings only for the authenticated member', async () => {
    const settings = createDefaultMemberNotificationSettings();
    settings.settings.collision = true;
    const store = {
      read: vi.fn(),
      save: vi.fn(async (_memberId: string, value: typeof settings) => value),
    };
    const api = createMemberNotificationRoutes({ requireMember: async () => member, store });

    await expect(api.save({ authorization: 'Bearer token', body: settings })).resolves.toEqual({
      status: 200,
      body: settings,
    });
    expect(store.save).toHaveBeenCalledWith('member-1', settings);
  });
});
