import {
  normalizeMemberNotificationSettings,
  validateMemberNotificationSettings,
  type MemberNotificationSettings,
} from '../backend/member-notification-settings';
import { getSupabaseClient } from './lib/supabase';

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

export type { MemberNotificationSettings };

async function memberRpc<T>(name: string, args?: Record<string, unknown>) {
  const client = getSupabaseClient();
  const { data, error } = args
    ? await client.rpc(name, args)
    : await client.rpc(name);
  if (error) throw error;
  return data as T;
}

export function bootstrapMember() {
  return memberRpc<MemberBootstrapResponse>('member_bootstrap');
}

export function fetchMemberProfile() {
  return memberRpc<MemberProfileResponse>('member_profile');
}

export async function fetchNotificationSettings() {
  const data = await memberRpc<unknown>('member_notification_settings_get');
  return normalizeMemberNotificationSettings(data);
}

export async function saveNotificationSettings(settings: MemberNotificationSettings) {
  const normalized = validateMemberNotificationSettings(settings);
  const data = await memberRpc<unknown>('member_notification_settings_save', {
    p_settings: normalized,
  });
  return normalizeMemberNotificationSettings(data);
}
