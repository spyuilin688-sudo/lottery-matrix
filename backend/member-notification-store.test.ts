import { describe, expect, it, vi } from 'vitest';
import { createDefaultMemberNotificationSettings } from './member-notification-settings';
import { createMemberNotificationStore } from './member-notification-store';

const config = { url: 'https://project.supabase.co', serviceRoleKey: 'service-role-secret' };

describe('member notification store', () => {
  it('reads only the authenticated member row with backend credentials', async () => {
    const settings = createDefaultMemberNotificationSettings();
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{ settings }]), { status: 200 }));
    const store = createMemberNotificationStore(() => config, fetcher);

    await expect(store.read('member-1')).resolves.toEqual(settings);
    const [url, init] = fetcher.mock.calls[0];
    const requestUrl = new URL(String(url));
    expect(requestUrl.pathname).toBe('/rest/v1/notification_settings');
    expect(requestUrl.searchParams.get('member_id')).toBe('eq.member-1');
    expect(requestUrl.searchParams.get('select')).toBe('settings');
    expect(requestUrl.searchParams.get('limit')).toBe('1');
    expect(init?.headers).toMatchObject({
      apikey: 'service-role-secret',
      Authorization: 'Bearer service-role-secret',
    });
  });

  it('forces the authenticated member id on the upsert', async () => {
    const settings = createDefaultMemberNotificationSettings();
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{ settings }]), { status: 201 }));
    const store = createMemberNotificationStore(
      () => config,
      fetcher,
      () => new Date('2026-08-23T12:00:00.000Z'),
    );

    await expect(store.save('member-1', settings)).resolves.toEqual(settings);
    const [url, init] = fetcher.mock.calls[0];
    const requestUrl = new URL(String(url));
    expect(requestUrl.searchParams.get('on_conflict')).toBe('member_id');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      apikey: 'service-role-secret',
      Authorization: 'Bearer service-role-secret',
      Prefer: 'resolution=merge-duplicates,return=representation',
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      member_id: 'member-1',
      settings,
      updated_at: '2026-08-23T12:00:00.000Z',
    });
  });
});
