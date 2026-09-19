export type MatrixPlan =
  | 'free'
  | 'trial'
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'lifetime';

export type MemberContext = {
  authUserId: string;
  memberId: string;
  plan: MatrixPlan;
  active: boolean;
  referralSuccessCount: number;
  loginPerksEligible?: boolean;
  lineTrialStartedAt?: string | null;
};

export const anonymousMatrixMember: MemberContext = {
  authUserId: '',
  memberId: '',
  plan: 'free',
  active: false,
  referralSuccessCount: 0,
  loginPerksEligible: false,
};

export type MatrixEntitlements = {
  canUseSeven: boolean;
  canUseThirteen: boolean;
  canUseFullRange: boolean;
  canUseTianyan: boolean;
  canUseTiangong: boolean;
  canViewFullStatus: boolean;
};

function taipeiWeekday(now: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    weekday: 'short',
  }).format(now);
}

export function resolveMatrixEntitlements(
  member: MemberContext,
  now = new Date(),
): MatrixEntitlements {
  const weekday = taipeiWeekday(now);
  const isTuesdayOrFriday = weekday === 'Tue' || weekday === 'Fri';
  const isMondayOrThursday = weekday === 'Mon' || weekday === 'Thu';
  const referrals = member.referralSuccessCount;
  const paid = member.active && member.plan !== 'free';
  const quarterlyOrAbove = paid && (
    member.plan === 'quarterly'
    || member.plan === 'yearly'
    || member.plan === 'lifetime'
  );
  const yearlyOrLifetime = paid && (
    member.plan === 'yearly'
    || member.plan === 'lifetime'
  );
  // Runtime auth always sets this explicitly from the Supabase identity provider.
  // Undefined is kept eligible only for older injected route/test fixtures.
  const loginPerksEligible = member.loginPerksEligible !== false;
  const trialStart = Date.parse(member.lineTrialStartedAt ?? '');
  const trialElapsed = now.getTime() - trialStart;
  const hasRegistrationTrial = Boolean(member.authUserId && member.memberId)
    && Number.isFinite(trialStart) && trialElapsed >= 0;

  return {
    canUseSeven: paid
      || referrals >= 15
      || (loginPerksEligible && Boolean(member.authUserId && member.memberId) && isTuesdayOrFriday)
      || (referrals >= 10 && isMondayOrThursday),
    canUseThirteen: paid,
    canUseFullRange: paid || referrals >= 50 || (referrals >= 30 && isTuesdayOrFriday),
    canUseTianyan: quarterlyOrAbove || (hasRegistrationTrial && trialElapsed < 48 * 60 * 60 * 1000),
    canUseTiangong: yearlyOrLifetime || (hasRegistrationTrial && trialElapsed < 24 * 60 * 60 * 1000),
    canViewFullStatus: paid,
  };
}
