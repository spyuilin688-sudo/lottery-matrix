type ExploreMemberEntitlement = {
  planName: string | null;
  isLifetime: boolean;
  planExpiresAt?: string | null;
  lineUserId?: string | null;
  exploreEntitlements?: {
    canUseSeven: boolean;
    canUseThirteen: boolean;
    canUseFullRange: boolean;
  };
};

export type ExploreEntryDefaults = {
  period: "二期" | "七期" | "十三期";
  range: "標準範圍" | "完整範圍";
};

const MATRIX_PRO_PLANS = new Set(["月費方案", "季費方案", "年費方案", "終身方案"]);

function weekdayInTaipei(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    weekday: "short",
  }).format(date);
}

export function getExploreEntryDefaults(
  member: ExploreMemberEntitlement | null,
  now = new Date(),
): ExploreEntryDefaults {
  const access = member?.exploreEntitlements;
  if (access) return {
    period: access.canUseThirteen ? "十三期" : access.canUseSeven ? "七期" : "二期",
    range: access.canUseFullRange ? "完整範圍" : "標準範圍",
  };
  const expiry = member?.planExpiresAt ? Date.parse(member.planExpiresAt) : Number.POSITIVE_INFINITY;
  const hasActivePaidPlan = Boolean(
    member?.planName
    && MATRIX_PRO_PLANS.has(member.planName)
    && (!member.planExpiresAt || (Number.isFinite(expiry) && expiry >= now.getTime())),
  );
  const hasMatrixPro = Boolean(member?.isLifetime || hasActivePaidPlan);
  if (hasMatrixPro) return { period: "十三期", range: "完整範圍" };

  const weekday = weekdayInTaipei(now);
  return {
    period: member?.lineUserId && (weekday === "Tue" || weekday === "Fri") ? "七期" : "二期",
    range: "標準範圍",
  };
}
