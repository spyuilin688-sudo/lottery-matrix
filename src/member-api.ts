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
  exploreEntitlements?: {
    canUseSeven: boolean;
    canUseThirteen: boolean;
    canUseFullRange: boolean;
  };
};

export type MemberReferralSummary = {
  referralCode: string;
  referralSuccessCount: number;
  hasInvitationCode: boolean;
  canSubmitReferralCode: boolean;
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

export type MemberPushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type MemberPushSubscriptionDisableResponse = {
  disabled: boolean;
  endpoint: string;
};

export type { MemberNotificationSettings };

function isMemberAuthError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String(error.code ?? '') : '';
  return code === 'PGRST301';
}

async function memberRpc<T>(name: string, args?: Record<string, unknown>) {
  const client = getSupabaseClient();
  const request = () => args
    ? client.rpc(name, args)
    : client.rpc(name);

  let { data, error } = await request();
  if (!error) return data as T;
  if (!isMemberAuthError(error)) throw error;

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    try {
      await client.auth.signOut({ scope: 'local' });
    } catch {
      // A rejected server session can still be cleared from local auth storage by Supabase.
    }
    throw new Error('MEMBER_SESSION_EXPIRED');
  }

  ({ data, error } = await request());
  if (error) throw error;
  return data as T;
}

export function bootstrapMember() {
  return memberRpc<MemberBootstrapResponse>('member_bootstrap');
}

export function fetchMemberProfile() {
  return memberRpc<MemberProfileResponse>('member_profile');
}

export function fetchMemberReferralSummary() {
  return memberRpc<MemberReferralSummary>('member_referral_summary');
}

export function submitMemberReferralCode(referralCode: string) {
  return memberRpc<MemberReferralSummary>('member_referral_submit', {
    p_referral_code: referralCode.trim(),
  });
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
  return memberRpc<MemberPaymentHistoryItem[]>('member_payment_history_get');
}

export function fetchPushSubscriptionStatus(endpoint: string) {
  return memberRpc<{ enabled: boolean }>('member_push_subscription_status', { p_endpoint: endpoint });
}

export async function hasAuthenticatedMemberSession() {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw error;
  return Boolean(data.session);
}

export function savePushSubscription(input: MemberPushSubscriptionInput) {
  return memberRpc<{ enabled: true }>('member_push_subscription_save', {
    p_endpoint: input.endpoint,
    p_p256dh: input.p256dh,
    p_auth: input.auth,
  });
}

export function disablePushSubscription(endpoint: string) {
  return memberRpc<MemberPushSubscriptionDisableResponse>('member_push_subscription_disable', {
    p_endpoint: endpoint,
  });
}
