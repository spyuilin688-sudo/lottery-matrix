import type { MatrixEntitlements, MemberContext } from './matrix-entitlements';

export function testMatrixEntitlements(member: MemberContext, now = new Date()): MatrixEntitlements {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', weekday: 'short' }).format(now);
  const paid = member.active && member.plan !== 'free';
  const referrals = member.referralSuccessCount;
  return {
    canUseSeven: paid || referrals >= 15
      || (member.loginPerksEligible !== false && Boolean(member.authUserId && member.memberId) && (weekday === 'Tue' || weekday === 'Fri'))
      || (referrals >= 10 && (weekday === 'Mon' || weekday === 'Thu')),
    canUseThirteen: paid,
    canUseFullRange: paid || referrals >= 50 || (referrals >= 30 && (weekday === 'Tue' || weekday === 'Fri')),
    canUseTianyan: paid && ['quarterly', 'yearly', 'lifetime'].includes(member.plan),
    canUseTiangong: paid && ['yearly', 'lifetime'].includes(member.plan),
    canViewFullStatus: paid,
  };
}
