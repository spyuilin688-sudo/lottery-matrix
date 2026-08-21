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
};

export const anonymousMatrixMember: MemberContext = {
  authUserId: '',
  memberId: '',
  plan: 'free',
  active: false,
  referralSuccessCount: 0,
};

export type MatrixEntitlements = {
  canUseSeven: boolean;
  canUseThirteen: boolean;
  canUseFullRange: boolean;
  canUseTianyan: boolean;
  canUseTiangong: boolean;
  canViewFullStatus: boolean;
  canCustomizeStatus: boolean;
  canUseCompositeCustomRoad: boolean;
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
  const customizable = paid && member.plan !== 'trial';

  return {
    canUseSeven: paid
      || referrals >= 15
      || isTuesdayOrFriday
      || (referrals >= 10 && isMondayOrThursday),
    canUseThirteen: paid,
    canUseFullRange: paid || referrals >= 50 || (referrals >= 30 && isTuesdayOrFriday),
    canUseTianyan: quarterlyOrAbove,
    canUseTiangong: yearlyOrLifetime,
    canViewFullStatus: paid,
    canCustomizeStatus: customizable,
    canUseCompositeCustomRoad: quarterlyOrAbove,
  };
}
