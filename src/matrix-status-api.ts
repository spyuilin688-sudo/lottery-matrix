import type { LotteryId } from './Prototype';
import { matrixApiFetch } from './matrix-api-client';

export type MatrixStatusCode = 'ACTIVE' | 'FOCUS' | 'RESONANCE' | 'CRITICAL' | 'DORMANT';
export type CustomMatrixStatusCode = Exclude<MatrixStatusCode, 'DORMANT'>;
export type CustomRoadType = '加減' | '合值' | '拖牌' | '複合';
export type CustomNumberOrder = '依號碼由小到大排序' | '依實際開獎順序排序';

export type CustomConditionRow = {
  consecutive: string;
  roadType: CustomRoadType;
  numberOrder: CustomNumberOrder;
  sameCodeQuantity: number;
};

export type CustomConditionGroup = { id: string; rows: CustomConditionRow[] };
export type CustomStatusConfig = {
  lottery: LotteryId;
  status: CustomMatrixStatusCode;
  explorePeriods: 13;
  exploreRange: '完整範圍';
  oneCodeGroups: CustomConditionGroup[];
  twoCodeGroups: CustomConditionGroup[];
};

export type MatrixStatusRoad = {
  id: string;
  result: string[];
  algorithmType: '加減' | '合值' | '拖牌' | '複合';
  numberOrder?: CustomNumberOrder;
  streak: number;
  predictionDistance: number;
  position: number;
  lockedNumber: string;
};

export type MatrixStatusResponse = {
  kind: 'status';
  lottery: LotteryId;
  drawPeriod: string;
  analysisVersion: string;
  summary: { status: MatrixStatusCode; count: number; message: string };
  counts: Record<CustomMatrixStatusCode, number>;
  cards: Array<{
    id: string;
    status: CustomMatrixStatusCode;
    result: string[];
    sameCodeRoadCount: number;
    roads: MatrixStatusRoad[];
  }>;
  customTriggers: Array<{ status: CustomMatrixStatusCode; groupId: string }>;
  detailLocked: boolean;
};

function jsonBody(value: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) };
}

export function fetchMatrixStatus(lottery: LotteryId) {
  return matrixApiFetch<MatrixStatusResponse>('/api/matrix/status', jsonBody({ lottery }));
}

export function listCustomStatusSettings() {
  return matrixApiFetch<{
    items: Array<{ config: CustomStatusConfig; evaluation: Record<string, unknown> }>;
    entitlements?: { canCustomizeStatus: boolean; canUseCompositeCustomRoad: boolean };
  }>('/api/matrix/status/settings');
}

export function saveCustomStatusSetting(config: CustomStatusConfig) {
  return matrixApiFetch<{ item: CustomStatusConfig }>('/api/matrix/status/settings', jsonBody(config));
}

export function resetCustomStatusSetting(lottery: LotteryId, status: CustomMatrixStatusCode) {
  return matrixApiFetch<Record<string, never>>('/api/matrix/status/settings/reset', jsonBody({ lottery, status }));
}
