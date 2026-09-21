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
