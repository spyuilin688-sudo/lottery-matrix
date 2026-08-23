import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchJson: vi.fn() }));
vi.mock('./matrix-api-client', () => ({ matrixApiFetch: api.fetchJson }));

import {
  bootstrapMember,
  fetchMemberProfile,
  fetchNotificationSettings,
  saveNotificationSettings,
} from './member-api';

beforeEach(() => api.fetchJson.mockReset().mockResolvedValue({}));

describe('member API', () => {
  it('bootstraps the authenticated LINE member', async () => {
    await bootstrapMember();
    expect(api.fetchJson).toHaveBeenCalledWith('/api/member/bootstrap', { method: 'POST' });
  });

  it('loads the authenticated member profile', async () => {
    await fetchMemberProfile();
    expect(api.fetchJson).toHaveBeenCalledWith('/api/member/profile');
  });

  it('loads and saves notification settings through authenticated member routes', async () => {
    const settings = {
      settings: { bet: true, result: true, win: true, status: true, card: true, collision: false, system: true, expiry: true },
      selectedOptions: { result: ['今彩539'], win: ['彩種通知'], status: ['今彩539'], card: ['今彩539'], system: ['維護'], expiry: ['提前1日'] },
      betTimes: { 今彩539: ['', ''], 天天樂: ['', ''], 褔彩: ['', ''], 大樂透: ['', ''] },
      statusOptions: { 今彩539: ['啟動'], 天天樂: ['啟動'], 褔彩: ['啟動'], 大樂透: ['啟動'] },
      collisionOptions: { 今彩539: ['獨碰二星'], 天天樂: ['獨碰二星'], 褔彩: ['獨碰二星'], 大樂透: ['獨碰二星'] },
    } as unknown as import('./member-api').MemberNotificationSettings;

    await fetchNotificationSettings();
    await saveNotificationSettings(settings);

    expect(api.fetchJson.mock.calls).toEqual([
      ['/api/member/notification-settings'],
      ['/api/member/notification-settings', expect.objectContaining({ method: 'PUT', body: JSON.stringify(settings) })],
    ]);
  });
});
