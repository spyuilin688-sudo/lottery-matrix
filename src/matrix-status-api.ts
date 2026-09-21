import type { LotteryId } from './Prototype';
import { getSupabaseClient } from './lib/supabase';
import { MatrixApiError } from './matrix-api-client';
import type { ExploreValidationResponse } from './matrix-algorithm-api';
import { readThroughCache, stableCacheKey } from './read-cache';
import { readAlgorithmCacheScope } from './auth/algorithm-cache-scope';
import { getMatrixDataRevision } from './matrix-data-revision';
import { isLotteryReadCacheFresh, lotteryReadCacheTtlMs } from './lottery-cache-policy';
import {
  readMatrixStatusSummaryCacheEntry,
  writeMatrixStatusSummaryCache,
} from './matrix-result-cache';

export type MatrixStatusCode = 'ACTIVE' | 'FOCUS' | 'RESONANCE' | 'CRITICAL' | 'DORMANT';
export type MatrixTriggerStatusCode = Exclude<MatrixStatusCode, 'DORMANT'>;
export type MatrixStatusNumberOrder = '依號碼由小到大排序' | '依實際開獎順序排序';

export type MatrixStatusRoadDetail = {
  id: string;
  result: string[];
  locked: false;
  algorithmType: '加減' | '合值' | '拖牌' | '複合';
  numberOrder?: MatrixStatusNumberOrder;
  streak: number;
  predictionDistance: number;
  position: number;
  lockedNumber: string;
  explorePeriods: 2 | 7 | 13;
  validationItemId: string;
  referenceOffset?: number;
  referencePosition?: number;
};

export type MatrixStatusLockedRoad = {
  id: string;
  result: string[];
  explorePeriods: 2 | 7 | 13;
  locked: true;
};

export type MatrixStatusRoad = MatrixStatusRoadDetail | MatrixStatusLockedRoad;

export type MatrixStatusCard = {
  id: string;
  ruleId: string;
  status: MatrixTriggerStatusCode;
  hitType: 'one-code' | 'two-code';
  result: string[];
  sameCodeRoadCount: number | null;
  sameCodeRoadCountLocked: boolean;
  roads: MatrixStatusRoad[];
};

export type MatrixStatusResponse = {
  kind: 'status';
  lottery: LotteryId;
  drawPeriod: string;
  analysisVersion: string;
  sourceAnalysisVersion?: string;
  summary: { status: MatrixStatusCode; count: number; message: string };
  counts: Record<MatrixTriggerStatusCode, number>;
  cards: MatrixStatusCard[];
  detailLocked: boolean;
};

export type MatrixStatusBatchItem = {
  lottery: LotteryId;
  status: number;
  body: MatrixStatusResponse | { error?: { code?: string } };
};

export type MatrixStatusBatchResponse = {
  kind: 'status-batch';
  items: MatrixStatusBatchItem[];
};

export type MatrixStatusSummary = MatrixStatusResponse['summary'];

export type MatrixStatusSummaryResponse = {
  kind: 'status-summary';
  lottery: LotteryId;
  drawPeriod: string;
  analysisVersion: string;
  sourceAnalysisVersion?: string;
  summary: MatrixStatusSummary;
};

export type MatrixStatusSummaryBatchItem = {
  lottery: LotteryId;
  status: number;
  body: MatrixStatusSummaryResponse | { error?: { code?: string } };
};

export type MatrixStatusSummaryBatchResponse = {
  kind: 'status-summary-batch';
  items: MatrixStatusSummaryBatchItem[];
};

export type MatrixStatusValidationResponse = {
  kind: 'status-validation';
  lottery: LotteryId;
  drawPeriod: string;
  analysisVersion: string;
  itemId: string;
  validation: ExploreValidationResponse['validation'];
};

function statusRpcError(error: { message?: string } | null): never {
  const message = String(error?.message ?? 'API_ERROR');
  if (message.includes('AUTH_REQUIRED')) throw new MatrixApiError('AUTH_REQUIRED', 401);
  if (message.includes('FORBIDDEN')) throw new MatrixApiError('FORBIDDEN', 403);
  if (message.includes('ANALYSIS_NOT_READY')) throw new MatrixApiError('ANALYSIS_NOT_READY', 404);
  if (message.includes('ANALYSIS_VERSION_MISMATCH')) {
    throw new MatrixApiError('ANALYSIS_VERSION_MISMATCH', 409);
  }
  throw new MatrixApiError('API_ERROR', 500);
}

export function fetchMatrixStatus(lottery: LotteryId, signal?: AbortSignal) {
  return fetchMatrixStatusFromFunction(lottery, signal);
}

export function fetchMatrixStatuses(lotteries: LotteryId[], signal?: AbortSignal) {
  return statusFunction<MatrixStatusBatchResponse>({ action: 'batch', lotteries }, signal);
}

function cacheableSummaryItem(
  item: MatrixStatusSummaryBatchItem | undefined,
  lottery: LotteryId,
) {
  if (!item || item.lottery !== lottery || item.status !== 200) return false;
  const body = item.body as MatrixStatusSummaryResponse | { error?: { code?: string } };
  return 'kind' in body
    && body.kind === 'status-summary'
    && body.lottery === lottery
    && typeof body.drawPeriod === 'string'
    && body.drawPeriod.length > 0
    && typeof body.analysisVersion === 'string'
    && body.analysisVersion.length > 0;
}

export async function fetchMatrixStatusSummaries(
  lotteries: LotteryId[],
  signal?: AbortSignal,
): Promise<MatrixStatusSummaryBatchResponse> {
  const dataRevision = getMatrixDataRevision();
  const itemsByLottery = new Map<LotteryId, MatrixStatusSummaryBatchItem>();
  const missing: LotteryId[] = [];

  for (const lottery of lotteries) {
    const stored = readMatrixStatusSummaryCacheEntry<MatrixStatusSummaryBatchItem>(lottery);
    if (stored
      && stored.dataRevision === dataRevision
      && isLotteryReadCacheFresh(lottery, 'standard', stored.savedAt)
      && cacheableSummaryItem(stored.value, lottery)) {
      itemsByLottery.set(lottery, stored.value);
    } else {
      missing.push(lottery);
    }
  }

  if (missing.length) {
    const fresh = await statusFunction<MatrixStatusSummaryBatchResponse>({
      action: 'summary-batch',
      lotteries: missing,
    }, signal);
    if (fresh?.kind !== 'status-summary-batch' || !Array.isArray(fresh.items)) {
      throw new MatrixApiError('API_ERROR', 500);
    }
    const freshByLottery = new Map(fresh.items.map((item) => [item.lottery, item] as const));
    for (const lottery of missing) {
      const item = freshByLottery.get(lottery);
      if (!item) throw new MatrixApiError('API_ERROR', 500);
      itemsByLottery.set(lottery, item);
      if (cacheableSummaryItem(item, lottery)) {
        writeMatrixStatusSummaryCache(lottery, item, dataRevision);
      }
    }
  }

  return {
    kind: 'status-summary-batch',
    items: lotteries.map((lottery) => {
      const item = itemsByLottery.get(lottery);
      if (!item) throw new MatrixApiError('API_ERROR', 500);
      return item;
    }),
  };
}

async function fetchMatrixStatusFromFunction(lottery: LotteryId, signal?: AbortSignal) {
  // A caller-owned abort signal must not cancel another consumer's shared read.
  return signal ? statusFunction<MatrixStatusResponse>({ lottery }, signal)
    : cachedStatusFunction<MatrixStatusResponse>({ lottery });
}

async function cachedStatusFunction<T>(body: Record<string, unknown>): Promise<T> {
  const client = getSupabaseClient();
  const scope = await readAlgorithmCacheScope(client, { allowGuest: true });
  const revision = getMatrixDataRevision();
  const assertCurrent = async () => {
    if (await readAlgorithmCacheScope(client, { allowGuest: true }) !== scope) {
      throw new MatrixApiError('AUTH_REQUIRED', 401);
    }
    if (getMatrixDataRevision() !== revision) {
      throw new MatrixApiError('ANALYSIS_VERSION_MISMATCH', 409);
    }
  };
  // Every access revalidates current membership and active analysis identity.
  // Only the large result is cached; expiry, revocation and weekday perks stay server-owned.
  const identityBody = { action: 'identity', lottery: body.lottery,
    ...(body.drawPeriod ? { drawPeriod: body.drawPeriod } : {}) };
  const identityKey = stableCacheKey('matrix-rpc:status-access', { scope, revision, identityBody });
  const identity = await readThroughCache(identityKey, 0, async () => {
    const value = await statusFunction<{ kind: string; drawPeriod: string; analysisVersion: string; entitlements: Record<string, boolean> }>(identityBody);
    await assertCurrent();
    if (value?.kind !== 'status-identity' || !value.drawPeriod || !value.analysisVersion || !value.entitlements) {
      throw new MatrixApiError('API_ERROR', 500);
    }
    return value;
  });
  await assertCurrent();
  if (body.analysisVersion && body.analysisVersion !== identity.analysisVersion) {
    throw new MatrixApiError('ANALYSIS_VERSION_MISMATCH', 409);
  }
  const cacheIdentity = { drawPeriod: identity.drawPeriod, analysisVersion: identity.analysisVersion, entitlements: identity.entitlements };
  const key = stableCacheKey('matrix-rpc:status', { scope, revision, cacheIdentity, body });
  const lottery = body.lottery as LotteryId;
  const result = await readThroughCache(key, lotteryReadCacheTtlMs(lottery, 'standard'), async ({ isCurrent }) => {
    const value = await statusFunction<T & { cacheIdentity?: unknown }>(body);
    await assertCurrent();
    if (stableCacheKey('', value?.cacheIdentity) !== stableCacheKey('', cacheIdentity)) {
      throw new MatrixApiError('ANALYSIS_VERSION_MISMATCH', 409);
    }
    if (!isCurrent()) throw new MatrixApiError('ANALYSIS_VERSION_MISMATCH', 409);
    return value;
  });
  await assertCurrent();
  return result;
}

async function statusFunction<T>(body: Record<string, unknown>, signal?: AbortSignal) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke('matrix-status', {
    body,
    signal,
  });
  if (error) {
    let code = '';
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: { code?: unknown } };
        code = String(payload.error?.code ?? '');
      } catch {
        code = '';
      }
    }
    statusRpcError({ message: code || error.message });
  }
  return data as T;
}

export function fetchMatrixStatusValidation(
  meta: { lottery: LotteryId; drawPeriod: string; analysisVersion: string },
  itemId: string,
) {
  return cachedStatusFunction<MatrixStatusValidationResponse>({
    action: 'validation',
    ...meta,
    itemId,
  });
}
