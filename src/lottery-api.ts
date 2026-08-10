import type { NumberBallLottery } from './NumberBall';

export const LOTTERY_API_BASE = 'https://app-snsxet.v2.appdeploy.ai';

export type LotteryDrawRecord = {
  period?: string;
  issue?: string;
  drawDate?: string;
  date?: string;
  numbers: Array<string | number>;
  specialNumber?: string | number;
  special?: string | number;
  [key: string]: unknown;
};

export type LatestLotteryResponse = {
  item: LotteryDrawRecord | null;
};

export type LotteryHistoryResponse = {
  items: LotteryDrawRecord[];
};

function normalizeRecord(record: LotteryDrawRecord): LotteryDrawRecord {
  return {
    ...record,
    period: record.period ?? record.issue,
    drawDate: record.drawDate ?? record.date,
    numbers: Array.isArray(record.numbers) ? record.numbers : [],
    specialNumber: record.specialNumber ?? record.special,
  };
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${LOTTERY_API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Lottery API ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchLatestLotteryDraw(lottery: NumberBallLottery) {
  const data = await requestJson<LatestLotteryResponse>(
    `/api/matrix/latest/${encodeURIComponent(lottery)}`,
  );
  return data.item ? normalizeRecord(data.item) : null;
}

export async function fetchLotteryHistory(
  lottery: NumberBallLottery,
  limit = 100,
) {
  const data = await requestJson<LotteryHistoryResponse>(
    `/api/matrix/history/${encodeURIComponent(lottery)}?limit=${limit}`,
  );
  return data.items.map(normalizeRecord);
}
