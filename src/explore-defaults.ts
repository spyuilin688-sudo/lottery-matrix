type ExploreMemberEntitlement = {
  planName: string | null;
  isLifetime: boolean;
  planExpiresAt?: string | null;
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
    period: weekday === "Tue" || weekday === "Fri" ? "七期" : "二期",
    range: "標準範圍",
  };
}
