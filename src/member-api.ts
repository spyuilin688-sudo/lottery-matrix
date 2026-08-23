import { matrixApiFetch } from './matrix-api-client';

export type MemberBootstrapResponse = {
  memberId: string;
  lineUserId: string;
};

export type MemberProfileResponse = {
  lineUserId: string | null;
  planName: string | null;
  planExpiresAt: string | null;
  isLifetime: boolean;
};

export type MemberNotificationSettings = {
  settings: {
    bet: boolean;
    result: boolean;
    win: boolean;
    status: boolean;
    card: boolean;
    collision: boolean;
    system: boolean;
    expiry: boolean;
  };
  selectedOptions: Record<string, string[]> & {
    result: string[];
    win: string[];
    status: string[];
    card: string[];
    system: string[];
    expiry: string[];
  };
  betTimes: Record<'今彩539' | '天天樂' | '六合彩' | '大樂透', [string, string]>;
  statusOptions: Record<'今彩539' | '天天樂' | '六合彩' | '大樂透', string[]>;
  collisionOptions: Record<'今彩539' | '天天樂' | '六合彩' | '大樂透', string[]>;
};

export function bootstrapMember() {
  return matrixApiFetch<MemberBootstrapResponse>('/api/member/bootstrap', { method: 'POST' });
}

export function fetchMemberProfile() {
  return matrixApiFetch<MemberProfileResponse>('/api/member/profile');
}

export function fetchNotificationSettings() {
  return matrixApiFetch<MemberNotificationSettings>('/api/member/notification-settings');
}

export function saveNotificationSettings(settings: MemberNotificationSettings) {
  return matrixApiFetch<MemberNotificationSettings>('/api/member/notification-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
}
