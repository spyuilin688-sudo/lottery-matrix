import type { LotteryId } from './Prototype';
import { getSupabaseClient } from './lib/supabase';
import { MatrixApiError } from './matrix-api-client';
import type { ExploreValidationResponse } from './matrix-algorithm-api';
import type { CustomStatusConfig } from '../shared/matrix-status-config';
export type { CustomConditionRow, CustomConditionGroup, CustomStatusConfig } from '../shared/matrix-status-config';

export type MatrixStatusCode = 'ACTIVE' | 'FOCUS' | 'RESONANCE' | 'CRITICAL' | 'DORMANT';
export type CustomMatrixStatusCode = Exclude<MatrixStatusCode, 'DORMANT'>;
export type CustomRoadType = '加減' | '合值' | '拖牌' | '複合';
export type CustomNumberOrder = '依號碼由小到大排序' | '依實際開獎順序排序';

export type MatrixStatusRoadDetail = {
  id: string;
  result: string[];
  locked: false;
  algorithmType: '加減' | '合值' | '拖牌' | '複合';
  numberOrder?: CustomNumberOrder;
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
  status: CustomMatrixStatusCode;
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
  counts: Record<CustomMatrixStatusCode, number>;
  cards: MatrixStatusCard[];
  customTriggers: Array<{ status: CustomMatrixStatusCode; groupId: string }>;
  detailLocked: boolean;
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

async function statusRpc<T>(name: string, args?: Record<string, unknown>) {
  const client = getSupabaseClient();
  // Custom settings RPCs are authenticated-only; a guest is a login state,
  // not an opaque PostgREST permission error.
  const session = await client.auth.getSession();
  if (session.error) statusRpcError(session.error);
  if (!session.data.session) throw new MatrixApiError('AUTH_REQUIRED', 401);
  const { data, error } = args ? await client.rpc(name, args) : await client.rpc(name);
  if (error) statusRpcError(error);
  return data as T;
}

export function fetchMatrixStatus(lottery: LotteryId) {
  return fetchMatrixStatusFromFunction(lottery);
}

async function fetchMatrixStatusFromFunction(lottery: LotteryId) {
  return statusFunction<MatrixStatusResponse>({ lottery });
}

async function statusFunction<T>(body: Record<string, unknown>) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke('matrix-status', {
    body,
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

export function listCustomStatusSettings() {
  return statusRpc<{
    items: Array<{ config: CustomStatusConfig; evaluation: Record<string, unknown> }>;
    entitlements?: { canCustomizeStatus: boolean; canUseCompositeCustomRoad: boolean };
  }>('matrix_custom_status_list');
}

export function saveCustomStatusSetting(config: CustomStatusConfig) {
  return statusRpc<{ item: CustomStatusConfig }>('matrix_custom_status_save', { p_config: config });
}

export function resetCustomStatusSetting(lottery: LotteryId, status: CustomMatrixStatusCode) {
  return statusRpc<Record<string, never>>('matrix_custom_status_reset', {
    p_lottery: lottery,
    p_status: status,
  });
}
