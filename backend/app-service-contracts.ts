export type AppMemberStatus = 'active' | 'disabled';
export type AppEntitlements = {
  canUseSeven: boolean;
  canUseThirteen: boolean;
  canUseFullRange: boolean;
  canUseTianyan: boolean;
  canUseTiangong: boolean;
  canViewFullStatus: boolean;
};
export type AppProfile = {
  memberId: string;
  displayName: string | null;
  status: AppMemberStatus;
  entitlementSource: 'free_launch';
  entitlementRevision: number;
  entitlements: AppEntitlements;
};
export type AppRevenueReport = {
  transactionCount: number;
  totalsByCurrency: Array<{ currency: string; grossMinor: number }>;
};
export type AppDeletionResult = {
  status: 'completed' | 'pending';
  authIdentity: 'retained' | 'deleted' | 'pending';
};
