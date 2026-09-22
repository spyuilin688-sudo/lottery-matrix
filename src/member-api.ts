import {
  normalizeMemberNotificationSettings,
  validateMemberNotificationSettings,
  type MemberNotificationSettings,
} from '../backend/member-notification-settings';
import { getSupabaseClient } from './lib/supabase';
import { getAlgorithmCacheScope } from './auth/algorithm-cache-scope';

export type MemberBootstrapResponse = {
  memberId: string;
  lineUserId: string;
};

export type MemberProfileResponse = {
  memberId: string;
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
export type PaymentStatus = TransferRequestStatus | 'refunded' | 'chargeback' | 'cancelled';

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
  status: PaymentStatus;
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

function isDefinitivelyInvalidMemberSession(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const status = 'status' in error ? Number(error.status) : 0;
  const code = 'code' in error ? String(error.code ?? '') : '';
  // Only an explicit auth rejection may remove local credentials. Transport,
  // rate-limit and unknown server failures must remain recoverable.
  return status === 401 || [
    'bad_jwt', 'session_not_found', 'user_not_found',
    'refresh_token_not_found', 'refresh_token_already_used',
  ].includes(code);
}

async function memberRpc<T>(
  name: string,
  args?: Record<string, unknown>,
  expectedScope = getAlgorithmCacheScope(),
) {
  const client = getSupabaseClient();
  const scope = expectedScope;
  const assertCurrentMember = () => {
    if (scope !== getAlgorithmCacheScope()) throw new Error('MEMBER_SESSION_CHANGED');
  };
  const request = () => args
    ? client.rpc(name, args)
    : client.rpc(name);

  let { data, error } = await request();
  assertCurrentMember();
  if (!error) return data as T;
  if (!isMemberAuthError(error)) throw error;

  const { data: userData, error: userError } = await client.auth.getUser();
  // Recovery must never replay captured write arguments or sign out a newer member.
  assertCurrentMember();
  if (userError && !isDefinitivelyInvalidMemberSession(userError)) throw userError;
  if (userError || !userData.user) {
    try {
      await client.auth.signOut({ scope: 'local' });
    } catch {
      // A rejected server session can still be cleared from local auth storage by Supabase.
    }
    assertCurrentMember();
    throw new Error('MEMBER_SESSION_EXPIRED');
  }

  ({ data, error } = await request());
  assertCurrentMember();
  if (error) throw error;
  return data as T;
}

function isMemberSessionChanged(error: unknown) {
  return error instanceof Error && error.message === 'MEMBER_SESSION_CHANGED';
}

async function memberSessionStableRpc<T>(name: string, expectedScope?: number) {
  try {
    return await memberRpc<T>(name, undefined, expectedScope ?? getAlgorithmCacheScope());
  } catch (error) {
    if (!isMemberSessionChanged(error)) throw error;
    // Only the no-argument bootstrap/profile calls use this retry path. Bootstrap is
    // idempotent server-side, and no member write payload is captured or replayed.
    return memberRpc<T>(name);
  }
}

let sharedBootstrap: { scope: number; promise: Promise<MemberBootstrapResponse> } | null = null;

export function bootstrapMember() {
  const scope = getAlgorithmCacheScope();
  if (sharedBootstrap?.scope === scope) return sharedBootstrap.promise;

  let promise = memberSessionStableRpc<MemberBootstrapResponse>('member_bootstrap', scope);
  promise = promise.catch((error) => {
    if (sharedBootstrap?.promise === promise) sharedBootstrap = null;
    throw error;
  });
  sharedBootstrap = { scope, promise };
  return promise;
}

export function fetchMemberProfile() {
  return memberSessionStableRpc<MemberProfileResponse>('member_profile');
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
