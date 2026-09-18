import { describe, expect, it, vi } from 'vitest';
import {
  createPermissionSettings,
  isPermissionSettingKey,
} from './permission-settings';

const current = {
  subscriptionPurchaseVisible: false,
  registeredMemberFreeAccess: true,
  revision: 7,
  updatedAt: '2026-09-10T22:00:00.000Z',
};

describe('administrator Matrix permission settings adapter', () => {
  it('reads and validates the canonical settings RPC response', async () => {
    const supabaseRequest = vi.fn(async () => current);
    const settings = createPermissionSettings({ supabaseRequest });

    await expect(settings.get()).resolves.toEqual(current);
    expect(supabaseRequest).toHaveBeenCalledWith('rpc/matrix_permission_settings', {
      method: 'POST',
      body: '{}',
    });
  });

  it.each([
    null,
    [],
    {},
    { ...current, subscriptionPurchaseVisible: 'false' },
    { ...current, registeredMemberFreeAccess: 1 },
    { ...current, revision: -1 },
    { ...current, revision: 1.5 },
    { ...current, updatedAt: 'not-a-date' },
  ])('rejects malformed upstream settings without inventing defaults', async (value) => {
    const settings = createPermissionSettings({ supabaseRequest: vi.fn(async () => value) });
    await expect(settings.get()).rejects.toThrow('PERMISSION_SETTINGS_UNAVAILABLE');
  });

  it('updates one exact key with the authenticated server actor and expected revision', async () => {
    const supabaseRequest = vi.fn(async () => ({ ...current, revision: 8 }));
    const settings = createPermissionSettings({ supabaseRequest });

    await expect(settings.update(
      '11111111-1111-4111-8111-111111111111',
      'subscriptionPurchaseVisible',
      true,
      7,
    )).resolves.toEqual({ ...current, revision: 8 });
    expect(supabaseRequest).toHaveBeenCalledWith('rpc/admin_matrix_permission_settings_update', {
      method: 'POST',
      body: JSON.stringify({
        p_admin_id: '11111111-1111-4111-8111-111111111111',
        p_change: { key: 'subscriptionPurchaseVisible', value: true, expectedRevision: 7 },
      }),
    });
  });

  it('recognizes only the two existing public setting keys', () => {
    expect(isPermissionSettingKey('subscriptionPurchaseVisible')).toBe(true);
    expect(isPermissionSettingKey('registeredMemberFreeAccess')).toBe(true);
    expect(isPermissionSettingKey('unknown')).toBe(false);
    expect(isPermissionSettingKey(null)).toBe(false);
  });
});
