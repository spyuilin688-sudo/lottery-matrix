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
  it('excludes the retired win fields from notification defaults', () => {
    const defaults = createDefaultMemberNotificationSettings();
    expect(defaults.settings).not.toHaveProperty('win');
    expect(defaults.selectedOptions).not.toHaveProperty('win');
  });

  it('accepts legacy clients but never stores or returns retired win fields', async () => {
    const settings = createDefaultMemberNotificationSettings();
    const legacy = { ...settings, settings: { ...settings.settings, win: true }, selectedOptions: { ...settings.selectedOptions, win: ['獎金通知'] } };
    const store = { read: vi.fn(async () => legacy), save: vi.fn(async (_id: string, value: typeof settings) => value) };
    const api = createMemberNotificationRoutes({ requireMember: async () => member, store });
    await expect(api.get({ authorization: 'Bearer token', body: {} })).resolves.toEqual({ status: 200, body: settings });
    await expect(api.save({ authorization: 'Bearer token', body: legacy })).resolves.toEqual({ status: 200, body: settings });
    expect(store.save).toHaveBeenCalledWith('member-1', settings);
  });

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

  it('tolerantly normalizes legacy saved settings on read', async () => {
    const store = {
      read: vi.fn(async () => ({
        settings: { bet: false },
        selectedOptions: { result: ['今彩539', 'unknown', '今彩539'] },
        betTimes: { 今彩539: ['16:00'] },
        statusOptions: { 今彩539: ['啟動', 'unknown'] },
        collisionOptions: {},
      })),
      save: vi.fn(),
    };
    const api = createMemberNotificationRoutes({ requireMember: async () => member, store });

    await expect(api.get({ authorization: 'Bearer token', body: {} })).resolves.toEqual({
      status: 200,
      body: {
        ...createDefaultMemberNotificationSettings(),
        settings: { ...createDefaultMemberNotificationSettings().settings, bet: false },
        selectedOptions: { ...createDefaultMemberNotificationSettings().selectedOptions, result: ['今彩539'] },
        betTimes: { ...createDefaultMemberNotificationSettings().betTimes, 今彩539: ['16:00', ''] },
        statusOptions: { ...createDefaultMemberNotificationSettings().statusOptions, 今彩539: ['啟動'] },
      },
    });
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

  it.each([
    ['unknown option', (settings: ReturnType<typeof createDefaultMemberNotificationSettings>) => {
      settings.statusOptions['今彩539'] = ['啟動', '任意狀態'];
    }],
    ['duplicate oversized options', (settings: ReturnType<typeof createDefaultMemberNotificationSettings>) => {
      settings.selectedOptions.result = Array(20).fill('今彩539');
    }],
    ['missing required boolean', (settings: ReturnType<typeof createDefaultMemberNotificationSettings>) => {
      delete (settings.settings as Partial<typeof settings.settings>).bet;
    }],
    ['extra root field', (settings: ReturnType<typeof createDefaultMemberNotificationSettings>) => {
      (settings as Record<string, unknown>).unexpected = true;
    }],
    ['missing selected option key', (settings: ReturnType<typeof createDefaultMemberNotificationSettings>) => {
      delete settings.selectedOptions.status;
    }],
    ['unknown selected option key', (settings: ReturnType<typeof createDefaultMemberNotificationSettings>) => {
      settings.selectedOptions.unexpected = [];
    }],
    ['invalid bet time', (settings: ReturnType<typeof createDefaultMemberNotificationSettings>) => {
      settings.betTimes['今彩539'] = ['16:00', '23:59'];
    }],
  ])('rejects %s instead of persisting data outside the current UI contract', async (_name, mutate) => {
    const settings = createDefaultMemberNotificationSettings();
    mutate(settings);
    const store = { read: vi.fn(), save: vi.fn() };
    const api = createMemberNotificationRoutes({ requireMember: async () => member, store });

    await expect(api.save({ authorization: 'Bearer token', body: settings })).resolves.toEqual({
      status: 400,
      body: { error: { code: 'INVALID_NOTIFICATION_SETTINGS' } },
    });
    expect(store.save).not.toHaveBeenCalled();
  });

  it('does not expose backend read or save failure details', async () => {
    const api = createMemberNotificationRoutes({
      requireMember: async () => member,
      store: {
        read: async () => { throw new Error('SUPABASE_PRIVATE_READ_DETAIL'); },
        save: async () => { throw new Error('unexpected private save detail'); },
      },
    });

    await expect(api.get({ authorization: 'Bearer token', body: {} })).resolves.toEqual({
      status: 502,
      body: { error: { code: 'MEMBER_NOTIFICATION_SETTINGS_READ_FAILED' } },
    });
    await expect(api.save({ authorization: 'Bearer token', body: createDefaultMemberNotificationSettings() })).resolves.toEqual({
      status: 500,
      body: { error: { code: 'MEMBER_NOTIFICATION_SETTINGS_SAVE_FAILED' } },
    });
  });
});
