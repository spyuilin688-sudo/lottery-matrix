import type { MatrixAlgorithmType, MatrixLottery, MatrixNumberOrder } from './matrix-algorithm-shared';

/**
 * Compatibility types only.
 * Matrix 探索的實際計算已移至 Railway Worker，結果由 Supabase RPC 提供給前端。
 * 此檔不得再加入 AppDeploy 探索計算或儲存邏輯。
 */
export type ExploreArtifactRow = {
  id: string;
  number: string;
  lockedPosition: number;
  predictionDistance: number;
  consecutive: string;
  highestStreak: number;
  predictionNumbers: string[];
  algorithmType: MatrixAlgorithmType;
  numberOrder: MatrixNumberOrder;
  explorePeriods: 2 | 7 | 13;
  exploreDateOffset: 0 | 1 | 2;
  ruleCount: 1 | 2;
  lockedSourceIndex?: number;
  lockedSourcePeriod?: string;
  referenceOffset?: number;
  referencePosition?: number;
};

export type ExploreValidation = {
  itemId: string;
  sourceA?: Record<string, unknown>;
  ruleSets: Array<Record<string, unknown>>;
};

export type ExploreArtifact = {
  lottery: MatrixLottery;
  drawPeriod: string;
  items: ExploreArtifactRow[];
  validationById: Record<string, ExploreValidation>;
};
