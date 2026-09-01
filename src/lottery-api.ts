import type { NumberBallLottery } from './NumberBall';
import { RAILWAY_API_BASE } from './runtime-api-config';
import { clearReadCache, readThroughCache, stableCacheKey } from './read-cache';
import {
  getMatrixCurrentPeriod,
  readLotteryHistoryCache,
  readLotteryLatestCache,
  setMatrixCurrentPeriod,
  writeLotteryHistoryCache,
  writeLotteryLatestCache,
} from './matrix-result-cache';

export const LOTTERY_API_BASE = RAILWAY_API_BASE;
const LOTTERY_READ_CACHE_MS = 5 * 60 * 1_000;
const latestPeriods = new Map<NumberBallLottery, string | undefined>();

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

export type MatrixCardOrder = 'draw' | 'sorted';

export type MatrixCardManifest = {
  lottery: NumberBallLottery;
  period: string | null;
  cards: Record<MatrixCardOrder, { url: string }>;
};

export function matrixCardUrl(path: string) {
  if (!LOTTERY_API_BASE) {
    throw new Error('Railway Lottery API is not configured');
  }
  return new URL(path, LOTTERY_API_BASE).toString();
}

export async function fetchMatrixCardManifest(lottery: NumberBallLottery): Promise<MatrixCardManifest> {
  const payload = await requestJson<Partial<MatrixCardManifest>>(
    `/api/matrix/cards/${encodeURIComponent(lottery)}`,
  );
  if (
    payload.lottery !== lottery
    || !payload.cards?.draw?.url
    || !payload.cards?.sorted?.url
  ) {
    throw new Error('Lottery API returned invalid matrix card metadata');
  }
  return {
    lottery,
    period: typeof payload.period === 'string' ? payload.period : null,
    cards: {
      draw: { url: payload.cards.draw.url },
      sorted: { url: payload.cards.sorted.url },
    },
  };
}

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

export function normalizePeriod(lottery: NumberBallLottery, value: unknown) {
  if (value === null || value === undefined) return undefined;
  const period = String(value).trim();
  if (lottery !== '今彩539' && lottery !== '大樂透') return period;
  const legacyPeriod = period.match(/^(\d{2,3})000(\d{3})$/);
  return legacyPeriod
    ? `${legacyPeriod[1].padStart(3, '0')}${legacyPeriod[2]}`
    : period;
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
  if (!LOTTERY_API_BASE) {
    throw new Error('Railway Lottery API is not configured');
  }
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

function assertLotteryDrawRecord(value: unknown, field: string): asserts value is LotteryDrawRecord {
  if (!isLotteryDrawRecord(value)) {
    throw new Error(`Lottery API invalid response: ${field}`);
  }
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
  return readThroughCache(
    stableCacheKey('lottery:latest', { lottery }),
    LOTTERY_READ_CACHE_MS,
    async () => {
      const cached = readLotteryLatestCache<LotteryDrawRecord>(lottery, LOTTERY_READ_CACHE_MS);
      if (cached) {
        const record = normalizeRecord(lottery, cached);
        if (record.period) setMatrixCurrentPeriod(lottery, record.period);
        latestPeriods.set(lottery, record.period);
        return record;
      }
      const data = await requestJson<LatestLotteryResponse>(
        `/api/matrix/latest/${encodeURIComponent(lottery)}`,
      );
      const item = isLatestLotteryEnvelope(data) ? data.item : data;
      if (item === null || item === undefined) return null;
      assertLotteryDrawRecord(item, 'item');
      const record = normalizeRecord(lottery, item);
      const previousPeriod = latestPeriods.get(lottery);
      if (previousPeriod && previousPeriod !== record.period) clearReadCache(`lottery:history:${lottery}:`);
      if (record.period) setMatrixCurrentPeriod(lottery, record.period);
      latestPeriods.set(lottery, record.period);
      writeLotteryLatestCache(lottery, record);
      return record;
    },
  );
}

export async function fetchLotteryHistory(
  lottery: NumberBallLottery,
  limit?: number,
) {
  return readThroughCache(
    `lottery:history:${lottery}:${stableCacheKey('', { limit })}`,
    LOTTERY_READ_CACHE_MS,
    async () => {
      const latest = await fetchLatestLotteryDraw(lottery);
      const drawPeriod = latest?.period ?? getMatrixCurrentPeriod(lottery);
      if (drawPeriod) {
        const cached = readLotteryHistoryCache<LotteryDrawRecord[]>(lottery, drawPeriod, limit);
        if (cached) return cached;
      }
      const query = typeof limit === 'number' ? `?limit=${limit}` : '';
      const data = await requestJson<LotteryHistoryResponse>(
        `/api/matrix/history/${encodeURIComponent(lottery)}${query}`,
      );
      const items = Array.isArray(data) ? data : data.items ?? [];
      assertArrayField(items, 'items');
      items.forEach((item, index) => assertLotteryDrawRecord(item, `items[${index}]`));
      const result = items.map((item) => normalizeRecord(lottery, item));
      const resultPeriod = drawPeriod ?? result[0]?.period;
      if (resultPeriod) writeLotteryHistoryCache(lottery, resultPeriod, limit, result);
      return result;
    },
  );
}

function orderedNumbers(record: LotteryDrawRecord, order: MatrixNumberOrder) {
  if (order === '依實際開獎順序排序' && record.drawOrderNumbers?.length) {
    return normalizeNumberList(record.drawOrderNumbers);
  }
  return normalizeNumberList(record.sortedNumbers?.length ? record.sortedNumbers : record.numbers);
}

function projectHistoryRecord(
  lottery: NumberBallLottery,
  record: LotteryDrawRecord,
  order: MatrixNumberOrder,
) {
  const numbers = orderedNumbers(record, order);
  return normalizeProjectedRecord(lottery, {
    ...record,
    numbers,
    specialNumber: numbers.length === 7 ? numbers[6] : record.specialNumber,
  });
}

export async function fetchTongXing(input: TongXingRequest) {
  return readThroughCache(stableCacheKey('lottery:tongxing', input), LOTTERY_READ_CACHE_MS, async () => {
    const history = await fetchLotteryHistory(input.lottery);
    const groups: TongXingPair[] = [];
    for (let lockedIndex = input.futureOffset; lockedIndex < history.length; lockedIndex += 1) {
      const lockedEntry = history[lockedIndex];
      if (!input.numbers.every((number) => orderedNumbers(lockedEntry, input.numberOrder).includes(number))) {
        continue;
      }
      groups.push({
        lockedEntry: projectHistoryRecord(input.lottery, lockedEntry, input.numberOrder),
        predictedEntry: projectHistoryRecord(input.lottery, history[lockedIndex - input.futureOffset], input.numberOrder),
      });
    }
    return { ...input, groups: groups.reverse() };
  });
}

export async function fetchNumberReference(input: NumberReferenceRequest) {
  return readThroughCache(stableCacheKey('lottery:number-reference', input), LOTTERY_READ_CACHE_MS, async () => {
    const history = await fetchLotteryHistory(input.lottery, input.historyRange);
    return {
      ...input,
      items: [...history].reverse().map((record) => {
        const numbers = orderedNumbers(record, input.numberOrder);
        return {
          ...projectHistoryRecord(input.lottery, record, input.numberOrder),
          matchSlots: numbers.map((number) => input.numbers.indexOf(number) + 1),
        };
      }),
    };
  });
}
