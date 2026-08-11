import type { NumberBallLottery } from './NumberBall';

export const LOTTERY_API_BASE = 'https://api-v2.appdeploy.ai/app/app-snsxet';

export type LotteryDrawRecord = {
  period?: string;
  issue?: string;
  drawDate?: string;
  date?: string;
  numbers: Array<string | number>;
  sortedNumbers?: Array<string | number>;
  drawOrderNumbers?: Array<string | number>;
  specialNumber?: string | number;
  special?: string | number;
  [key: string]: unknown;
};

type LatestLotteryEnvelope = {
  item?: LotteryDrawRecord | null;
};

export type LatestLotteryResponse = LatestLotteryEnvelope | LotteryDrawRecord | null;

export type LotteryHistoryResponse = {
  items?: LotteryDrawRecord[];
} | LotteryDrawRecord[];

function normalizeNumberList(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map((value) => String(value).trim().padStart(2, '0'))
    : [];
}

function sortDrawNumbers(values: string[]) {
  if (values.length === 7) {
    return [
      ...values.slice(0, 6).sort((a, b) => Number(a) - Number(b)),
      values[6],
    ];
  }
  return [...values].sort((a, b) => Number(a) - Number(b));
}

function normalizeRecord(record: LotteryDrawRecord): LotteryDrawRecord {
  const numbers = normalizeNumberList(record.numbers);
  const sortedNumbers = normalizeNumberList(record.sortedNumbers);
  const drawOrderNumbers = normalizeNumberList(record.drawOrderNumbers);
  const normalizedSortedNumbers = sortedNumbers.length
    ? sortedNumbers
    : sortDrawNumbers(numbers);

  return {
    ...record,
    period: record.period ?? record.issue,
    drawDate: record.drawDate ?? record.date,
    numbers: normalizedSortedNumbers,
    sortedNumbers: normalizedSortedNumbers,
    drawOrderNumbers: drawOrderNumbers.length ? drawOrderNumbers : numbers,
    specialNumber: record.specialNumber ?? record.special,
  };
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${LOTTERY_API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Lottery API ${response.status}: ${response.statusText}`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Lottery API returned ${contentType || 'non-JSON response'}`);
  }
  return response.json() as Promise<T>;
}

function isLatestLotteryEnvelope(data: LatestLotteryResponse): data is LatestLotteryEnvelope {
  return (
    data !== null &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Object.prototype.hasOwnProperty.call(data, 'item')
  );
}

export async function fetchLatestLotteryDraw(lottery: NumberBallLottery) {
  const data = await requestJson<LatestLotteryResponse>(
    `/api/matrix/latest/${encodeURIComponent(lottery)}`,
  );
  const item = isLatestLotteryEnvelope(data) ? data.item : data;
  return item ? normalizeRecord(item) : null;
}

export async function fetchLotteryHistory(
  lottery: NumberBallLottery,
  limit?: number,
) {
  const query = typeof limit === 'number' ? `?limit=${limit}` : '';
  const data = await requestJson<LotteryHistoryResponse>(
    `/api/matrix/history/${encodeURIComponent(lottery)}${query}`,
  );
  const items = Array.isArray(data) ? data : data.items ?? [];
  return items.map(normalizeRecord);
}
