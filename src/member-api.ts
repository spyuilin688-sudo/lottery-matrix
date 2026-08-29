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

export type ManualTransferPlanCode = 'month' | 'quarter' | 'year';
export type TransferRequestStatus = 'pending' | 'confirmed' | 'rejected';

export type MemberTransferRequest = {
  id: string;
  planName: string;
  amount: number;
  accountLastFive: string;
  submittedAt: string;
  status: TransferRequestStatus;
};

export type MemberPaymentHistoryItem = {
  id: string;
  planName: string;
  amount: number;
  accountLastFive?: string;
  submittedAt: string;
  paidAt?: string | null;
  status: TransferRequestStatus;
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

export function submitTransferRequest(planCode: ManualTransferPlanCode, accountLastFive: string) {
  return memberRpc<MemberTransferRequest>('member_transfer_request_submit', {
    p_plan_code: planCode,
    p_account_last_five: accountLastFive,
  });
}

export function fetchPendingTransferRequest() {
  return memberRpc<MemberTransferRequest | null>('member_pending_transfer_request');
}

export function fetchMemberPaymentHistory() {
  return memberRpc<MemberPaymentHistoryItem[]>('member_payment_history');
}
