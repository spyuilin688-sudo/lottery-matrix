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

export type MatrixNumberOrder = '依號碼由小到大排序' | '依實際開獎順序排序';

export type TongXingRequest = {
  lottery: NumberBallLottery;
  numberOrder: MatrixNumberOrder;
  numbers: string[];
  futureOffset: number;
};

export type TongXingPair = {
  lockedEntry: LotteryDrawRecord;
  predictedEntry: LotteryDrawRecord;
};

type TongXingResponse = {
  lottery: NumberBallLottery;
  numberOrder: MatrixNumberOrder;
  numbers: string[];
  futureOffset: number;
  groups: TongXingPair[];
};

export type NumberReferenceRequest = {
  lottery: NumberBallLottery;
  numberOrder: MatrixNumberOrder;
  historyRange: 1000 | 3000 | 5000;
  numbers: string[];
};

export type NumberReferenceItem = LotteryDrawRecord & {
  matchSlots: number[];
};

type NumberReferenceResponse = {
  lottery: NumberBallLottery;
  numberOrder: MatrixNumberOrder;
  historyRange: 1000 | 3000 | 5000;
  numbers: string[];
  items: NumberReferenceItem[];
};

function normalizeNumberList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    const digits = String(value).trim();
    if (!/^\d{1,2}$/.test(digits)) return [];
    const number = Number(digits);
    if (!Number.isInteger(number) || number < 1 || number > 49) return [];
    return [String(number).padStart(2, '0')];
  });
}

function normalizeSpecialNumber(record: LotteryDrawRecord) {
  const value = record.specialNumber ?? record.special;
  if (value === null || value === undefined) return undefined;
  const digits = String(value).trim();
  if (!/^\d{1,2}$/.test(digits)) return undefined;
  const number = Number(digits);
  if (!Number.isInteger(number) || number < 1 || number > 49) return undefined;
  return String(number).padStart(2, '0');
}

function appendSpecialNumber(
  lottery: NumberBallLottery,
  values: string[],
  specialNumber?: string,
) {
  if ((lottery !== '六合彩' && lottery !== '大樂透') || !specialNumber || values.length !== 6) {
    return values;
  }
  return [...values, specialNumber];
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
  const specialNumber = normalizeSpecialNumber(record);
  const numbers = appendSpecialNumber(lottery, normalizeNumberList(record.numbers), specialNumber);
  const sortedNumbers = appendSpecialNumber(lottery, normalizeNumberList(record.sortedNumbers), specialNumber);
  const drawOrderNumbers = appendSpecialNumber(lottery, normalizeNumberList(record.drawOrderNumbers), specialNumber);
  const normalizedSortedNumbers = sortedNumbers.length
    ? sortDrawNumbers(sortedNumbers)
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
    specialNumber,
  };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  const response = await fetch(`${LOTTERY_API_BASE}${path}`, {
    ...init,
    headers,
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

function normalizeProjectedRecord(lottery: NumberBallLottery, record: LotteryDrawRecord): LotteryDrawRecord {
  const normalizedPeriod = normalizePeriod(lottery, record.period ?? record.issue);
  const normalizedDrawDate = normalizeDrawDate(record.drawDate ?? record.date);
  const specialNumber = normalizeSpecialNumber(record);
  const numbers = appendSpecialNumber(lottery, normalizeNumberList(record.numbers), specialNumber);
  const sortedNumbers = appendSpecialNumber(lottery, normalizeNumberList(record.sortedNumbers), specialNumber);
  const drawOrderNumbers = appendSpecialNumber(lottery, normalizeNumberList(record.drawOrderNumbers), specialNumber);
  return {
    ...record,
    period: normalizedPeriod,
    issue: normalizedPeriod,
    drawDate: normalizedDrawDate,
    date: normalizedDrawDate,
    numbers,
    sortedNumbers: sortedNumbers.length ? sortedNumbers : undefined,
    drawOrderNumbers: drawOrderNumbers.length ? drawOrderNumbers : undefined,
    specialNumber,
  };
}

function isLatestLotteryEnvelope(data: LatestLotteryResponse): data is LatestLotteryEnvelope {
  return (
    data !== null &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Object.prototype.hasOwnProperty.call(data, 'item')
  );
}

function assertArrayField(value: unknown, field: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Lottery API invalid response: ${field}`);
  }
}

function isLotteryDrawRecord(value: unknown): value is LotteryDrawRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Array.isArray((value as { numbers?: unknown }).numbers);
}

function assertTongXingGroup(value: unknown, index: number): asserts value is TongXingPair {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Lottery API invalid response: groups[${index}]`);
  }
  const group = value as { lockedEntry?: unknown; predictedEntry?: unknown };
  if (!isLotteryDrawRecord(group.lockedEntry) || !isLotteryDrawRecord(group.predictedEntry)) {
    throw new Error(`Lottery API invalid response: groups[${index}]`);
  }
}

function assertNumberReferenceItem(value: unknown, index: number): asserts value is NumberReferenceItem {
  if (!isLotteryDrawRecord(value)) {
    throw new Error(`Lottery API invalid response: items[${index}]`);
  }
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

export async function fetchTongXing(input: TongXingRequest) {
  const data = await requestJson<TongXingResponse>('/api/matrix/tongxing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  assertArrayField(data.groups, 'groups');
  data.groups.forEach((group, index) => assertTongXingGroup(group, index));
  return {
    ...data,
    groups: data.groups.map((group) => ({
      lockedEntry: normalizeProjectedRecord(input.lottery, group.lockedEntry),
      predictedEntry: normalizeProjectedRecord(input.lottery, group.predictedEntry),
    })),
  };
}

export async function fetchNumberReference(input: NumberReferenceRequest) {
  const data = await requestJson<NumberReferenceResponse>('/api/matrix/number-reference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  assertArrayField(data.items, 'items');
  data.items.forEach((item, index) => assertNumberReferenceItem(item, index));
  return {
    ...data,
    items: data.items.map((item) => ({
      ...normalizeProjectedRecord(input.lottery, item),
      matchSlots: Array.isArray(item.matchSlots) ? item.matchSlots.map(Number) : [],
    })),
  };
}
