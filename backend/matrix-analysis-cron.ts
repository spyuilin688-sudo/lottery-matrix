export const ANALYSIS_LOTTERIES = ['今彩539','天天樂','六合彩','大樂透'] as const;
export type AnalysisLottery = typeof ANALYSIS_LOTTERIES[number];

export function matrixWorkerLimits(lottery: AnalysisLottery, afterRefresh = false) {
  return afterRefresh || lottery === '今彩539' || lottery === '天天樂'
    ? { maxExploreGroups: 1, batchBudgetMs: 15_000 }
    : { maxExploreGroups: 20, batchBudgetMs: 22_000 };
}

export async function runRefreshThenAnalysis<TRefresh, TAnalysis>(
  refresh: (() => Promise<TRefresh>) | undefined,
  analyze: () => Promise<TAnalysis>,
) {
  const refreshResult = refresh ? await refresh() : undefined;
  const analysis = await analyze();
  return { refresh: refreshResult, analysis };
}

export function selectAnalysisLottery(scheduledTime?: string): AnalysisLottery {
  const parsed = scheduledTime ? new Date(scheduledTime) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const slot = Math.floor(date.getUTCMinutes() / 5) % ANALYSIS_LOTTERIES.length;
  return ANALYSIS_LOTTERIES[slot];
}

export function isTaipeiRefreshWindow(scheduledTime: string | undefined, hour: number) {
  if (!scheduledTime) return false;
  const parsed = new Date(scheduledTime);
  if (Number.isNaN(parsed.getTime())) return false;
  const taipei = new Date(parsed.getTime() + 8 * 60 * 60 * 1_000);
  return taipei.getUTCHours() === hour && taipei.getUTCMinutes() >= 35;
}
