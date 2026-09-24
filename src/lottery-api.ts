import { invalidateMatrixData } from './matrix-data-revision';
import type { NumberBallLottery } from './NumberBall';
import { fetchWithPolicy, withRequestId } from './lib/api-resilience';
import { RAILWAY_API_BASE } from './runtime-api-config';
import { clearReadCache, readThroughCache, stableCacheKey } from './read-cache';
import { isLotteryReadCacheFresh, lotteryReadCacheExpiresAt, lotteryReadCacheTtlMs } from './lottery-cache-policy';
import {
  getMatrixCurrentPeriod,
  clearMatrixLotteryData,
  clearLotteryLatestCache,
  clearPublishedResultCache,
  readPublishedResultCacheEntry,
  readLotteryHistoryCacheEntry,
  readLotteryLatestCacheEntry,
  readLotteryQueryCacheEntry,
  setMatrixCurrentPeriod,
  writeLotteryHistoryCache,
  writeLotteryLatestCache,
  writeLotteryQueryCache,
  writePublishedResultCache,
} from './matrix-result-cache';

export const LOTTERY_API_BASE = RAILWAY_API_BASE;
const latestRecords = new Map<NumberBallLottery, LotteryDrawRecord>();
const historyRecords = new Map<string, LotteryDrawRecord[]>();
const historyIdentities = new WeakMap<LotteryDrawRecord[], number>();
let nextHistoryIdentity = 0;

function historyIdentity(records: LotteryDrawRecord[]) {
  let identity = historyIdentities.get(records);
  if (identity === undefined) {
    identity = ++nextHistoryIdentity;
    historyIdentities.set(records, identity);
  }
  return identity;
}

function drawFingerprint(record: LotteryDrawRecord) {
  return stableCacheKey('', {
    period: record.period, drawDate: record.drawDate, numbers: record.numbers,
    sortedNumbers: record.sortedNumbers, drawOrderNumbers: record.drawOrderNumbers,
    specialNumber: record.specialNumber, resultStatus: record.resultStatus,
    sourceRevision: record.sourceRevision,
  });
}

function historyFingerprint(records: LotteryDrawRecord[]) {
  return records.map(drawFingerprint).join('|');
}

function invalidateLotteryData(lottery: NumberBallLottery) {
  clearReadCache(`lottery:history:${lottery}:`);
  clearReadCache(`lottery:years:${lottery}`);
  clearReadCache(`lottery:tongxing:${lottery}:`);
  clearReadCache(`lottery:number-reference:${lottery}:`);
  invalidateMatrixData();
  clearMatrixLotteryData(lottery);
  for (const key of historyRecords.keys()) {
    if (key.startsWith(`${lottery}:`)) historyRecords.delete(key);
  }
}

export function invalidatePublishedLotteryData(lottery: NumberBallLottery) {
  clearReadCache('lottery:latest');
  clearReadCache('lottery:published-result:');
  clearLotteryLatestCache(lottery);
  clearPublishedResultCache();
  invalidateLotteryData(lottery);
}

export function revalidatePublishedLotteryData() {
  for (const lottery of ['今彩539', '天天樂', '六合彩', '大樂透'] as const) {
    clearLotteryLatestCache(lottery);
    clearMatrixLotteryData(lottery);
  }
  clearReadCache('lottery:');
  clearPublishedResultCache();
  invalidateMatrixData();
}

export type LatestLotteryResult = {
  lottery: NumberBallLottery;
  period?: string;
};

export type LatestLotteryResultState = {
  drawDate: string | null;
  dueLotteries: NumberBallLottery[];
  items: LatestLotteryResult[];
};

export type LotteryDrawRecord = {
  period?: string;
  issue?: string;
  drawDate?: string;
  date?: string;
  numbers: Array<string | number>;
  sortedNumbers?: Array<string | number>;
  drawOrderNumbers?: Array<string | number> | null;
  resultStatus?: 'preliminary' | 'confirmed';
  specialNumber?: string | number;
  special?: string | number;
  nextDrawAt?: string | null;
  [key: string]: unknown;
};

type LatestLotteryEnvelope = {
  item?: LotteryDrawRecord | null;
  revision?: string;
};

export type LatestLotteryResponse = LatestLotteryEnvelope | LotteryDrawRecord | null;

export type LotteryHistoryResponse = {
  items?: LotteryDrawRecord[];
  nextCursor?: QueryCursor | null;
  revision?: string;
} | LotteryDrawRecord[];

type QueryCursor = { offset: number; revision: string };
class HistoryChangedError extends Error {}

async function collectQueryPages<T>(
  request: (cursor: QueryCursor | null, size: number) => Promise<{ items: T[]; nextCursor?: QueryCursor | null }>,
  limit = Infinity,
): Promise<T[]> {
  // One restart allows a concurrent draw correction without mixing snapshots.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const items: T[] = [];
    let cursor: QueryCursor | null = null;
    try {
      do {
        const page = await request(cursor, Math.min(500, limit - items.length));
        assertArrayField(page.items, 'items');
        if (page.items.length > 500) throw new Error('INVALID_HISTORY_PAGE');
        items.push(...page.items);
        const next = page.nextCursor;
        if (next != null && (!Number.isSafeInteger(next.offset) || next.offset <= (cursor?.offset ?? 0)
          || typeof next.revision !== 'string' || !next.revision
          || (cursor && next.revision !== cursor.revision) || page.items.length === 0)) {
          throw new Error('INVALID_HISTORY_CURSOR');
        }
        cursor = next ?? null;
      } while (cursor && items.length < limit);
      return items.slice(0, limit);
    } catch (error) {
      if (!(error instanceof HistoryChangedError) || attempt === 1) throw error;
    }
  }
  throw new Error('DRAW_HISTORY_CHANGED');
}

export type MatrixCardOrder = 'draw' | 'sorted';

export type MatrixCardManifest = {
  lottery: NumberBallLottery;
  period: string | null;
  generation?: string;
  generatedAt?: string;
  cards: Partial<Record<MatrixCardOrder, { url: string }>>;
};

export function matrixCardUrl(path: string) {
  if (!LOTTERY_API_BASE) {
    throw new Error('Railway Lottery API is not configured');
  }
  return new URL(path, LOTTERY_API_BASE).toString();
}

export async function fetchMatrixCardManifest(lottery: NumberBallLottery): Promise<MatrixCardManifest> {
  const payload = await requestJson<Partial<MatrixCardManifest>>(
    `/api/matrix/cards/${encodeURIComponent(lottery)}?format=png`,
  );
  if (payload.lottery === lottery && payload.period === null) {
    return { lottery, period: null, cards: {} };
  }
  if (
    payload.lottery !== lottery
    || typeof payload.period !== 'string' || !payload.period
    || !payload.cards?.sorted?.url
  ) {
    throw new Error('Lottery API returned invalid matrix card metadata');
  }
  return {
    lottery,
    period: payload.period,
    generation: payload.generation,
    generatedAt: payload.generatedAt,
    cards: {
      ...(payload.cards.draw?.url ? { draw: { url: payload.cards.draw.url } } : {}),
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
    drawOrderNumbers,
    resultStatus: record.resultStatus ?? 'confirmed',
    specialNumber,
  };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!LOTTERY_API_BASE) {
    throw new Error('Railway Lottery API is not configured');
  }
  // Public cross-origin reads have no server-side request-id consumer. A custom
  // header turns each uncached GET into a CORS preflight before the actual read.
  const readMethod = !init?.method || /^(GET|HEAD)$/i.test(init.method);
  const headers = readMethod ? new Headers(init?.headers) : withRequestId(init?.headers).headers;
  if (readMethod) headers.delete('X-Request-ID');
  headers.set('Accept', 'application/json');
  const response = await fetchWithPolicy(`${LOTTERY_API_BASE}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    if (response.status === 409) {
      const error = await response.json().catch(() => null);
      if (error?.error === 'DRAW_HISTORY_CHANGED') throw new HistoryChangedError('DRAW_HISTORY_CHANGED');
    }
    throw new Error(`Lottery API ${response.status}`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('Lottery API returned non-JSON response');
  }
  try {
    return await response.json() as T;
  } catch {
    throw new Error('Lottery API returned invalid JSON');
  }
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
    drawOrderNumbers,
    resultStatus: record.resultStatus ?? 'confirmed',
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

function parseLatestLotteryList(values: unknown, field: string): LatestLotteryResult[] {
  if (!Array.isArray(values)) {
    throw new Error(`Lottery API invalid response: ${field}`);
  }
  const seen = new Set<NumberBallLottery>();
  return values.map((value, index) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Lottery API invalid response: ${field}[${index}]`);
    }
    const lottery = (value as { lottery?: unknown }).lottery;
    if (lottery !== '今彩539' && lottery !== '天天樂' && lottery !== '六合彩' && lottery !== '大樂透') {
      throw new Error(`Lottery API invalid response: ${field}[${index}].lottery`);
    }
    if (seen.has(lottery)) {
      throw new Error(`Lottery API invalid response: duplicate ${field}`);
    }
    seen.add(lottery);
    if (field === 'items') {
      const period = (value as { period?: unknown }).period;
      if (period !== undefined && (typeof period !== 'string' || !period.trim())) {
        throw new Error(`Lottery API invalid response: ${field}[${index}].period`);
      }
      return period === undefined ? { lottery } : { lottery, period };
    }
    return { lottery };
  });
}

function parseDueLotteries(values: unknown): NumberBallLottery[] {
  if (values === undefined) return [];
  return parseLatestLotteryList(
    Array.isArray(values) ? values.map((lottery) => ({ lottery })) : values,
    'dueLotteries',
  ).map(({ lottery }) => lottery);
}

function parsedLatestResultState(data: { drawDate?: unknown; items?: unknown; dueLotteries?: unknown }): LatestLotteryResultState {
  if (data.drawDate !== null && (typeof data.drawDate !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(data.drawDate))) {
    throw new Error('Lottery API invalid response: drawDate');
  }
  return {
    drawDate: data.drawDate === null ? null : data.drawDate as string,
    dueLotteries: parseDueLotteries(data.dueLotteries),
    items: parseLatestLotteryList(data.items, 'items'),
  };
}

function publishedResultCacheTtlMs(startedAt = Date.now()) {
  return Math.min(15 * 60_000, ...(['今彩539', '天天樂', '六合彩', '大樂透'] as const)
    .map(lottery => lotteryReadCacheTtlMs(lottery, 'latest', startedAt)));
}

export async function fetchLatestLotteryResultState(
  cycleDate?: string,
  signal?: AbortSignal,
): Promise<LatestLotteryResultState> {
  if (cycleDate !== undefined && !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(cycleDate)) {
    throw new Error('Lottery API invalid cycle date');
  }
  const query = cycleDate ? `?cycleDate=${encodeURIComponent(cycleDate)}` : '';
  // Today's due lotteries can change through a calendar override without a
  // draw publication. Recheck dated homepage requests on each entry/retry.
  if (cycleDate) {
    return parsedLatestResultState(await requestJson<{ drawDate?: unknown; items?: unknown; dueLotteries?: unknown }>(
      `/api/matrix/latest-result${query}`,
      signal ? { signal } : undefined,
    ));
  }
  let expiresAt = Infinity;
  return readThroughCache(
    stableCacheKey('lottery:published-result', { cycleDate }),
    publishedResultCacheTtlMs(),
    async ({ isCurrent }) => {
      const stored = readPublishedResultCacheEntry<LatestLotteryResultState>(cycleDate, Infinity);
      if (stored && Date.now() - stored.savedAt < publishedResultCacheTtlMs(stored.savedAt)) {
        try {
          const value = parsedLatestResultState(stored.value);
          expiresAt = stored.savedAt + publishedResultCacheTtlMs(stored.savedAt);
          return value;
        } catch { /* Recheck damaged browser storage with the public API. */ }
      }
      const data = await requestJson<{ drawDate?: unknown; items?: unknown; dueLotteries?: unknown }>(
        `/api/matrix/latest-result${query}`,
        signal ? { signal } : undefined,
      );
      const value = parsedLatestResultState(data);
      if (isCurrent()) writePublishedResultCache(cycleDate, value);
      expiresAt = Date.now() + publishedResultCacheTtlMs();
      return value;
    },
    { expiresAt: () => expiresAt },
  );
}

export async function fetchLatestLotteryResult(signal?: AbortSignal): Promise<LatestLotteryResult[]> {
  return (await fetchLatestLotteryResultState(undefined, signal)).items;
}

export async function fetchLatestLotteryDraw(lottery: NumberBallLottery): Promise<LotteryDrawRecord | null> {
  let expiresAt = Infinity;
  return readThroughCache(
    stableCacheKey('lottery:latest', { lottery }),
    lotteryReadCacheTtlMs(lottery, 'latest'),
    async ({ isCurrent }) => {
      // Keep the expired snapshot only for correction detection, never as fresh data.
      const stored = readLotteryLatestCacheEntry<LotteryDrawRecord>(lottery, Infinity);
      const cached = stored && isLotteryReadCacheFresh(lottery, 'latest', stored.savedAt)
        ? stored
        : null;
      if (cached && cached.value.resultStatus) {
        const record = normalizeRecord(lottery, cached.value);
        const previous = latestRecords.get(lottery);
        if (previous && drawFingerprint(previous) !== drawFingerprint(record)) invalidateLotteryData(lottery);
        if (record.period) setMatrixCurrentPeriod(lottery, record.period);
        latestRecords.set(lottery, record);
        expiresAt = lotteryReadCacheExpiresAt(lottery, 'latest', cached.savedAt);
        return record;
      }
      const data = await requestJson<LatestLotteryResponse>(
        `/api/matrix/latest/${encodeURIComponent(lottery)}`,
      );
      if (!isCurrent()) return fetchLatestLotteryDraw(lottery);
      const item = isLatestLotteryEnvelope(data) ? data.item : data;
      if (item === null || item === undefined) return null;
      assertLotteryDrawRecord(item, 'item');
      const revision = isLatestLotteryEnvelope(data) ? data.revision : undefined;
      const record = normalizeRecord(lottery, typeof revision === 'string' ? { ...item, sourceRevision: revision } : item);
      const previous = latestRecords.get(lottery) ?? (stored ? normalizeRecord(lottery, stored.value) : undefined);
      const previousPeriod = getMatrixCurrentPeriod(lottery);
      if ((previous && drawFingerprint(previous) !== drawFingerprint(record))
        || (previousPeriod && previousPeriod !== record.period)) invalidateLotteryData(lottery);
      if (record.period) setMatrixCurrentPeriod(lottery, record.period);
      latestRecords.set(lottery, record);
      writeLotteryLatestCache(lottery, record);
      expiresAt = lotteryReadCacheExpiresAt(lottery, 'latest');
      return record;
    },
    { expiresAt: () => expiresAt },
  );
}

export async function fetchLotteryHistoryYears(lottery: NumberBallLottery): Promise<string[]> {
  const latest = await fetchLatestLotteryDraw(lottery);
  const drawPeriod = latestRecords.get(lottery)?.period ?? latest?.period ?? getMatrixCurrentPeriod(lottery);
  const persistentKey = { kind: 'history-years-v1' };
  let expiresAt = Infinity;
  return readThroughCache(
    `lottery:years:${lottery}`,
    lotteryReadCacheTtlMs(lottery, 'standard'),
    async () => {
      const stored = drawPeriod
        ? readLotteryQueryCacheEntry<string[]>(lottery, drawPeriod, persistentKey, Infinity)
        : null;
      if (stored && isLotteryReadCacheFresh(lottery, 'standard', stored.savedAt)
        && Array.isArray(stored.value)
        && stored.value.every(year => typeof year === 'string' && /^\d{4}$/.test(year))) {
        expiresAt = lotteryReadCacheExpiresAt(lottery, 'standard', stored.savedAt);
        return stored.value;
      }
      const data = await requestJson<{ years: unknown }>(`/api/matrix/history-years/${encodeURIComponent(lottery)}`);
      if (!Array.isArray(data.years) || data.years.some(year => typeof year !== 'string' || !/^\d{4}$/.test(year))) {
        throw new Error('歷史年份格式不正確');
      }
      const years = [...new Set(data.years as string[])].sort().reverse();
      if (drawPeriod) writeLotteryQueryCache(lottery, drawPeriod, persistentKey, years);
      expiresAt = lotteryReadCacheExpiresAt(lottery, 'standard');
      return years;
    },
    { expiresAt: () => expiresAt },
  );
}

/** Bounded period lookup for validation evidence; does not scan history pages. */
export async function fetchLotteryHistoryPeriods(
  lottery: NumberBallLottery, periods: string[],
): Promise<LotteryDrawRecord[]> {
  const requested = [...new Set(periods)].sort();
  if (!requested.length) return [];
  if (requested.length > 500 || requested.some(period => !/^[0-9]{1,12}$/.test(period))) {
    throw new Error('INVALID_PERIODS');
  }
  await fetchLatestLotteryDraw(lottery);
  return readThroughCache(
    stableCacheKey(`lottery:history:${lottery}:periods`, requested), lotteryReadCacheTtlMs(lottery, 'standard'),
    async ({ isCurrent }) => {
      const query = new URLSearchParams({ periods: JSON.stringify(requested) });
      const data = await requestJson<{ items: LotteryDrawRecord[] }>(`/api/matrix/history/${encodeURIComponent(lottery)}?${query}`);
      if (!isCurrent()) return fetchLotteryHistoryPeriods(lottery, requested);
      assertArrayField(data.items, 'items');
      data.items.forEach((item, index) => assertLotteryDrawRecord(item, `items[${index}]`));
      return data.items.map(item => normalizeRecord(lottery, item));
    },
  );
}

export async function fetchLotteryHistory(
  lottery: NumberBallLottery,
  limit?: number,
): Promise<LotteryDrawRecord[]> {
  // Check the latest data before a history hit, so changed draws invalidate it.
  const latest = await fetchLatestLotteryDraw(lottery);
  const drawPeriod = latestRecords.get(lottery)?.period ?? latest?.period ?? getMatrixCurrentPeriod(lottery);
  let expiresAt = Infinity;
  const historyKey = `${lottery}:${limit ?? 'all'}`;
  return readThroughCache(
    `lottery:history:${lottery}:${stableCacheKey('', { limit })}`,
    lotteryReadCacheTtlMs(lottery, 'standard'),
    async ({ isCurrent }) => {
      const stored = drawPeriod ? readLotteryHistoryCacheEntry<LotteryDrawRecord[]>(lottery, drawPeriod, limit, Infinity) : null;
      // A server revision covers corrections to every draw, not just the latest period.
      const revisionUnchanged = typeof latest?.sourceRevision === 'string'
        && latest.sourceRevision.length > 0 && stored?.revision === latest.sourceRevision;
      const cached = revisionUnchanged
        ? stored
        : stored && isLotteryReadCacheFresh(lottery, 'standard', stored.savedAt)
          ? stored
          : null;
      // Older clients persisted fabricated draw-order fallbacks. Revalidate those snapshots.
      if (cached && cached.value.every(record => record.resultStatus)) {
        expiresAt = lotteryReadCacheExpiresAt(lottery, 'standard', revisionUnchanged ? Date.now() : cached.savedAt);
        historyRecords.set(historyKey, cached.value);
        return cached.value;
      }
      const previous = historyRecords.get(historyKey) ?? stored?.value;
      let historyRevision: string | undefined;
      const items = await collectQueryPages<LotteryDrawRecord>(async (cursor, size) => {
        const query = new URLSearchParams({ pageSize: String(size) });
        if (cursor) query.set('cursor', JSON.stringify(cursor));
        const data = await requestJson<LotteryHistoryResponse>(`/api/matrix/history/${encodeURIComponent(lottery)}?${query}`);
        const revision = Array.isArray(data) ? undefined : data.revision;
        if (!cursor) historyRevision = revision;
        else if (historyRevision !== revision) historyRevision = undefined;
        const items = Array.isArray(data) ? data : data?.items;
        assertArrayField(items, 'items');
        return Array.isArray(data) ? { items } : { ...data, items };
      }, limit);
      // A superseded response must not restore persistent data or reach callers.
      if (!isCurrent()) return fetchLotteryHistory(lottery, limit);
      assertArrayField(items, 'items');
      items.forEach((item, index) => assertLotteryDrawRecord(item, `items[${index}]`));
      const result = items.map((item) => normalizeRecord(lottery, item));
      if (previous && historyFingerprint(previous) !== historyFingerprint(result)) invalidateLotteryData(lottery);
      const resultPeriod = drawPeriod ?? result[0]?.period;
      if (resultPeriod) writeLotteryHistoryCache(lottery, resultPeriod, limit, result, historyRevision);
      historyRecords.set(historyKey, result);
      expiresAt = lotteryReadCacheExpiresAt(lottery, 'standard');
      return result;
    },
    { expiresAt: () => expiresAt },
  );
}

function orderedNumbers(record: LotteryDrawRecord, order: MatrixNumberOrder) {
  if (order === '依實際開獎順序排序') {
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

export async function fetchTongXing(input: TongXingRequest): Promise<TongXingResponse> {
  const latest = await fetchLatestLotteryDraw(input.lottery);
  const drawPeriod = latestRecords.get(input.lottery)?.period ?? latest?.period ?? getMatrixCurrentPeriod(input.lottery);
  const persistentKey = { kind: 'tongxing-v1', input };
  let expiresAt = Infinity;
  return readThroughCache(
    stableCacheKey(`lottery:tongxing:${input.lottery}`, input),
    lotteryReadCacheTtlMs(input.lottery, 'standard'),
    async ({ isCurrent }) => {
      const stored = drawPeriod
        ? readLotteryQueryCacheEntry<TongXingResponse>(input.lottery, drawPeriod, persistentKey, Infinity)
        : null;
      if (stored && isLotteryReadCacheFresh(input.lottery, 'standard', stored.savedAt)
        && Array.isArray(stored.value?.groups)) {
        try {
          stored.value.groups.forEach(assertTongXingGroup);
          expiresAt = lotteryReadCacheExpiresAt(input.lottery, 'standard', stored.savedAt);
          return stored.value;
        } catch {
          // Treat malformed persisted data as a miss and refresh it below.
        }
      }
      const groups = await collectQueryPages<TongXingPair>(async (cursor, size) => {
        const data = await requestJson<TongXingResponse & { nextCursor?: QueryCursor | null }>('/api/matrix/tongxing', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...input, pageSize: size, cursor }),
        });
        assertArrayField(data.groups, 'groups');
        data.groups.forEach(assertTongXingGroup);
        return { items: data.groups, nextCursor: data.nextCursor };
      });
      if (!isCurrent()) return fetchTongXing(input);
      const result = { ...input, groups: groups.map(pair => ({
        lockedEntry: normalizeProjectedRecord(input.lottery, pair.lockedEntry),
        predictedEntry: normalizeProjectedRecord(input.lottery, pair.predictedEntry),
      })) };
      if (drawPeriod) writeLotteryQueryCache(input.lottery, drawPeriod, persistentKey, result);
      expiresAt = lotteryReadCacheExpiresAt(input.lottery, 'standard');
      return result;
    },
    { expiresAt: () => expiresAt },
  );
}

export async function fetchNumberReference(input: NumberReferenceRequest) {
  const history = await fetchLotteryHistory(input.lottery, input.historyRange);
  return readThroughCache(stableCacheKey(`lottery:number-reference:${input.lottery}`, { ...input, source: historyIdentity(history) }), lotteryReadCacheTtlMs(input.lottery, 'standard'), async () => {
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
