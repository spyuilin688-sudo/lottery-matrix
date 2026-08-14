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
  nextDrawAt?: string | null;
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

function normalizePeriod(lottery: NumberBallLottery, value: unknown) {
  if (value === null || value === undefined) return undefined;
  const period = String(value).trim();
  if (lottery === '今彩539' || lottery === '大樂透') {
    return period.replace(/^(\d{3})000(\d{3})$/, '$1$2');
  }
  return period;
}

function normalizeDrawDate(value: unknown) {
  if (value === null || value === undefined) return undefined;
  const date = String(value).trim();
  const westernMatch = date.match(/(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
  const chineseMatch = date.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  const match = westernMatch ?? chineseMatch;

  if (!match) return date;

  const [, year, month, day] = match;
  return `${year}/${month.padStart(2, '0')}/${day.padStart(2, '0')}`;
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

function normalizeRecord(lottery: NumberBallLottery, record: LotteryDrawRecord): LotteryDrawRecord {
  const numbers = normalizeNumberList(record.numbers);
  const sortedNumbers = normalizeNumberList(record.sortedNumbers);
  const drawOrderNumbers = normalizeNumberList(record.drawOrderNumbers);
  const normalizedSortedNumbers = sortedNumbers.length
    ? sortedNumbers
    : sortDrawNumbers(numbers);
  const normalizedPeriod = normalizePeriod(lottery, record.period ?? record.issue);
  const normalizedDrawDate = normalizeDrawDate(record.drawDate ?? record.date);

  return {
    ...record,
    period: normalizedPeriod,
    issue: normalizedPeriod,
    drawDate: normalizedDrawDate,
    date: normalizedDrawDate,
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
  return item ? normalizeRecord(lottery, item) : null;
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
  return items.map((item) => normalizeRecord(lottery, item));
}
