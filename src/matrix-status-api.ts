import type { LotteryId } from './Prototype';
import { getSupabaseClient } from './lib/supabase';
import { MatrixApiError } from './matrix-api-client';
import type { ExploreValidationResponse } from './matrix-algorithm-api';

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

export function fetchMatrixStatusSummaries(lotteries: LotteryId[], signal?: AbortSignal) {
  return statusFunction<MatrixStatusSummaryBatchResponse>({ action: 'summary-batch', lotteries }, signal);
}

async function fetchMatrixStatusFromFunction(lottery: LotteryId, signal?: AbortSignal) {
  return statusFunction<MatrixStatusResponse>({ lottery }, signal);
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
  return statusFunction<MatrixStatusValidationResponse>({
    action: 'validation',
    ...meta,
    itemId,
  });
}
