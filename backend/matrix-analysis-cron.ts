export const ANALYSIS_LOTTERIES = ['今彩539','天天樂','六合彩','大樂透'] as const;
export type AnalysisLottery = typeof ANALYSIS_LOTTERIES[number];

export function selectAnalysisLottery(scheduledTime?: string): AnalysisLottery {
  const parsed = scheduledTime ? new Date(scheduledTime) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const slot = date.getUTCMinutes() % ANALYSIS_LOTTERIES.length;
  return ANALYSIS_LOTTERIES[slot];
}
