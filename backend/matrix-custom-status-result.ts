import {
  normalizeCustomStatusConfig,
  type CustomStatusConfig,
  type MatrixLottery,
} from './matrix-custom-status.ts';
import type { MatrixEntitlements } from './matrix-entitlements.ts';
import {
  buildMatrixStatusArtifact,
  type ExploreArtifact,
  type TianyanArtifact,
} from './matrix-status-service.ts';

export type MatrixCustomStatusSource = {
  analysisVersion: string;
  drawPeriod: string;
  explore: ExploreArtifact;
  tianyan: TianyanArtifact;
};

export type MatrixCustomStatusResult = {
  analysisVersion: string;
  drawPeriod: string;
  configKey: string;
  standardPayload: Record<string, unknown>;
  compositePayload: Record<string, unknown>;
};

const precomputeEntitlements: MatrixEntitlements = {
  canUseSeven: true,
  canUseThirteen: true,
  canUseFullRange: true,
  canUseTianyan: true,
  canUseTiangong: true,
  canViewFullStatus: true,
  canCustomizeStatus: true,
  canUseCompositeCustomRoad: false,
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonical(nested)]),
  );
}

export function matrixCustomStatusConfigKey(
  configs: CustomStatusConfig[],
  lottery: MatrixLottery,
) {
  const normalized = configs
    .filter((config) => config.lottery === lottery)
    .map(normalizeCustomStatusConfig)
    .sort((left, right) => left.status.localeCompare(right.status));
  return JSON.stringify(canonical(normalized));
}

export function buildMatrixCustomStatusResult(
  source: MatrixCustomStatusSource,
  configs: CustomStatusConfig[],
): MatrixCustomStatusResult {
  const lottery = source.explore.lottery;
  const lotteryConfigs = configs.filter((config) => config.lottery === lottery);
  if (lotteryConfigs.length === 0) throw new Error('CUSTOM_STATUS_CONFIG_NOT_FOUND');
  if (
    !source.analysisVersion
    || !source.drawPeriod
    || source.explore.drawPeriod !== source.drawPeriod
    || source.tianyan.drawPeriod !== source.drawPeriod
    || source.tianyan.lottery !== lottery
  ) throw new Error('ANALYSIS_NOT_READY');

  const standardPayload = buildMatrixStatusArtifact(
    source.explore,
    source.tianyan,
    lotteryConfigs,
    precomputeEntitlements,
  );
  const compositePayload = buildMatrixStatusArtifact(
    source.explore,
    source.tianyan,
    lotteryConfigs,
    { ...precomputeEntitlements, canUseCompositeCustomRoad: true },
  );

  return {
    analysisVersion: source.analysisVersion,
    drawPeriod: source.drawPeriod,
    configKey: matrixCustomStatusConfigKey(lotteryConfigs, lottery),
    standardPayload: standardPayload as unknown as Record<string, unknown>,
    compositePayload: compositePayload as unknown as Record<string, unknown>,
  };
}
